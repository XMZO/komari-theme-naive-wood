const READABLE_IMAGE_PROXY_ORIGIN = 'https://img.anidap.se'
const LEGACY_SERVICE_WORKER_NAME = '/komari-background-sw.js'
const LEGACY_CACHE_PREFIX = 'komari-background-cache-'

export async function fetchBackgroundImageBlob(sourceUrl: string) {
  const requestUrl = createBackgroundImageRequestUrl(sourceUrl)

  if (!shouldUseReadableProxy(requestUrl)) {
    return await fetchImageBlob(requestUrl, requestUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      mode: 'cors',
    })
  }

  const imageUrl = await resolveClientSelectedImageUrl(requestUrl).catch(() => requestUrl)
  const proxyUrl = getReadableBackgroundImageUrl(imageUrl)
  try {
    return await fetchImageBlob(proxyUrl, imageUrl, {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
    })
  }
  catch (proxyError) {
    try {
      return await fetchImageBlob(requestUrl, requestUrl, {
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
      })
    }
    catch {
      throw proxyError
    }
  }
}

function createBackgroundImageRequestUrl(sourceUrl: string) {
  const targetUrl = new URL(sourceUrl, window.location.href)
  if (targetUrl.protocol === 'http:' || targetUrl.protocol === 'https:') {
    targetUrl.searchParams.set('__komari_bg', createRequestKey())
  }
  return targetUrl.toString()
}

function getReadableBackgroundImageUrl(sourceUrl: string) {
  return `${READABLE_IMAGE_PROXY_ORIGIN}/${encodeURIComponent(sourceUrl)}`
}

async function resolveClientSelectedImageUrl(sourceUrl: string) {
  if (!shouldUseClientJsonResolver(sourceUrl)) {
    return sourceUrl
  }

  const jsonUrl = new URL(sourceUrl)
  jsonUrl.searchParams.set('json', '')

  const response = await fetch(jsonUrl.toString(), {
    cache: 'no-store',
    credentials: 'omit',
    mode: 'cors',
  })

  if (!response.ok) {
    throw new Error(`Failed to resolve background image URL: ${response.status}`)
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.startsWith('image/')) {
    throw new Error('JSON resolver returned an image response')
  }

  const imageUrl = extractImageUrl(await response.text())
  const resolvedUrl = new URL(imageUrl, response.url || jsonUrl.toString())
  if (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:') {
    throw new Error(`Invalid resolved background URL: ${resolvedUrl.protocol}`)
  }

  return resolvedUrl.toString()
}

async function fetchImageBlob(fetchUrl: string, sourceUrl: string, init: RequestInit) {
  const response = await fetch(fetchUrl, init)
  if (!response.ok) {
    throw new Error(`Failed to fetch background image: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Background response is not an image: ${contentType}`)
  }

  return {
    blob: await response.blob(),
    sourceUrl,
  }
}

function extractImageUrl(value: string) {
  const trimmedValue = value.trim()
  try {
    const parsed = JSON.parse(trimmedValue) as unknown
    const candidate = findImageUrlCandidate(parsed)
    if (candidate) {
      return candidate
    }
  }
  catch {
    // Some random image APIs return the URL as plain text.
  }

  if (/^https?:\/\//i.test(trimmedValue) || trimmedValue.startsWith('/')) {
    return trimmedValue
  }

  throw new Error('No image URL found in resolver response')
}

function findImageUrlCandidate(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findImageUrlCandidate(item)
      if (candidate) {
        return candidate
      }
    }
    return undefined
  }

  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = value as Record<string, unknown>
  const knownKeys = ['url', 'src', 'image', 'img', 'pic', 'picture', 'data']
  for (const key of knownKeys) {
    const candidate = findImageUrlCandidate(record[key])
    if (candidate) {
      return candidate
    }
  }

  return undefined
}

export function cleanupLegacyBackgroundProxy() {
  void unregisterLegacyServiceWorker().catch(() => {})
  void cleanupLegacyCaches().catch(() => {})
}

function shouldUseReadableProxy(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== window.location.origin
  }
  catch {
    return false
  }
}

function shouldUseClientJsonResolver(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl)
    return url.hostname === 't.alcy.cc'
  }
  catch {
    return false
  }
}

function createRequestKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function unregisterLegacyServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return
  }

  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(
    registrations
      .filter((registration) => {
        return [registration.active, registration.installing, registration.waiting].some((worker) => {
          return worker?.scriptURL.endsWith(LEGACY_SERVICE_WORKER_NAME)
        })
      })
      .map(registration => registration.unregister()),
  )
}

async function cleanupLegacyCaches() {
  if (!('caches' in window)) {
    return
  }

  const cacheNames = await caches.keys()
  await Promise.all(
    cacheNames
      .filter(cacheName => cacheName.startsWith(LEGACY_CACHE_PREFIX))
      .map(cacheName => caches.delete(cacheName)),
  )
}
