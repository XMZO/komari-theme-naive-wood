const WORDPRESS_IMAGE_PROXY_ORIGIN = 'https://i0.wp.com'
const FALLBACK_IMAGE_PROXY_ORIGIN = 'https://proxy.cors.sh'
const LEGACY_SERVICE_WORKER_NAME = '/komari-background-sw.js'
const LEGACY_CACHE_PREFIX = 'komari-background-cache-'
const FETCH_TIMEOUT_MS = 8000
const ALCY_RANDOM_PATH = /^\/(?:ycy|moez|ai|ysz|pivix|pc|moe|fj|bd|ys|acg|mp|moemp|ysmp|aimp|tx|lai|xhl)\/?$/

export type PreparedBackgroundImage
  = | {
    kind: 'proxied'
    displayUrl: string
    sourceUrl: string
    originalDownloadUrl: string
  }
  | {
    kind: 'blob'
    blob: Blob
    sourceUrl: string
    originalDownloadUrl?: string
  }
  | {
    kind: 'direct'
    displayUrl: string
    sourceUrl: string
  }

export async function prepareBackgroundImage(
  sourceUrl: string,
  onResolved?: (resolvedUrl: string) => void,
): Promise<PreparedBackgroundImage> {
  const requestUrl = createBackgroundImageRequestUrl(sourceUrl)
  let resolvedUrl = requestUrl
  let resolutionFailed = false
  // Onani returns a preview with a stable original URL. Never send this local endpoint to external proxies.
  if (isOnaniBackgroundUrl(requestUrl)) {
    const selectionUrl = new URL(requestUrl)
    selectionUrl.pathname += '/selection'
    const response = await fetchWithTimeout(selectionUrl, { cache: 'no-store', credentials: 'same-origin', mode: 'same-origin' }, 45000)
    if (response.ok) {
      const selection = JSON.parse(await response.text()) as { preview?: unknown, original?: unknown }
      const match = typeof selection.preview === 'string'
        ? /^\/api\/plugins\/onani\/background\/([a-f0-9]{64})\/preview$/.exec(selection.preview)
        : null
      if (!match || selection.original !== `/api/plugins/onani/background/${match[1]}/original`) {
        throw new Error('Invalid Onani image selection')
      }
      return { kind: 'proxied', sourceUrl: requestUrl, displayUrl: new URL(selection.preview as string, window.location.origin).toString(), originalDownloadUrl: new URL(selection.original as string, window.location.origin).toString() }
    }
    // Older Onani versions expose only the binary endpoint.
    if (response.status !== 404 && response.status !== 405)
      throw new Error(`Onani image selection failed: ${response.status}`)
    const result = await fetchImageBlob(requestUrl, requestUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      mode: 'same-origin',
    })
    return { kind: 'blob', ...result }
  }
  try {
    resolvedUrl = await resolveClientSelectedImageUrl(requestUrl)
    if (resolvedUrl !== requestUrl) {
      onResolved?.(resolvedUrl)
    }
  }
  catch {
    resolutionFailed = true
  }
  // A failed CORS lookup cannot give us a stable original URL. Fetch the random
  // image once through the readable proxy and display/save that same Blob.
  const preferReadableProxy = resolutionFailed || shouldPreferReadableProxy(resolvedUrl)

  if (preferReadableProxy) {
    const proxyResult = await fetchReadableProxyBlob(resolvedUrl).catch(() => null)
    if (proxyResult) {
      return { kind: 'blob', ...proxyResult }
    }
  }

  try {
    const result = await fetchImageBlob(resolvedUrl, resolvedUrl, {
      cache: 'no-store',
      credentials: isSameOrigin(resolvedUrl) ? 'same-origin' : 'omit',
      mode: 'cors',
    })
    return { kind: 'blob', ...result }
  }
  catch {
    // Most image CDNs allow <img> embedding but intentionally deny readable CORS responses.
  }

  if (!preferReadableProxy) {
    const proxyResult = await fetchReadableProxyBlob(resolvedUrl).catch(() => null)
    if (proxyResult) {
      return { kind: 'blob', ...proxyResult }
    }
  }

  return {
    kind: 'direct',
    displayUrl: resolvedUrl,
    sourceUrl: resolvedUrl,
  }
}

export function cleanupLegacyBackgroundProxy() {
  void unregisterLegacyServiceWorker().catch(() => {})
  void cleanupLegacyCaches().catch(() => {})
}

function createBackgroundImageRequestUrl(sourceUrl: string) {
  const targetUrl = new URL(sourceUrl, window.location.href)
  // 仅对已知的随机图 API 加缓存键；普通图片和带签名的 URL 不能擅自追加查询参数。
  if (
    (targetUrl.protocol === 'http:' || targetUrl.protocol === 'https:')
    && shouldUseClientJsonResolver(targetUrl.toString())
  ) {
    targetUrl.searchParams.set('__komari_bg', createRequestKey())
  }
  return targetUrl.toString()
}

async function resolveClientSelectedImageUrl(sourceUrl: string) {
  if (!shouldUseClientJsonResolver(sourceUrl)) {
    return sourceUrl
  }

  const jsonUrl = new URL(sourceUrl)
  jsonUrl.searchParams.set('json', '')

  const response = await fetchWithTimeout(jsonUrl.toString(), {
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

async function fetchReadableProxyBlob(sourceUrl: string) {
  const proxyUrls = getReadableProxyUrls(sourceUrl)
  if (proxyUrls.length === 0) {
    throw new Error('No readable image proxy is available for this URL')
  }

  let lastError: unknown
  for (const proxyUrl of proxyUrls) {
    try {
      return await fetchImageBlob(proxyUrl, sourceUrl, {
        cache: 'default',
        credentials: 'omit',
        mode: 'cors',
      })
    }
    catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('Failed to fetch background image through readable proxies')
}

function getReadableProxyUrls(sourceUrl: string) {
  let targetUrl: URL
  try {
    targetUrl = new URL(sourceUrl)
  }
  catch {
    return []
  }

  if (
    targetUrl.protocol !== 'https:'
    || targetUrl.port
    || targetUrl.username
    || targetUrl.password
    || !isPublicProxyTarget(targetUrl.hostname)
  ) {
    return []
  }

  targetUrl.hash = ''
  const normalizedSourceUrl = targetUrl.toString()

  const proxyUrls: string[] = []
  // Never forward a same-origin/private application URL to a public image service.
  if (isSameOrigin(normalizedSourceUrl)) {
    return []
  }
  {
    const wordpressUrl = new URL(`${WORDPRESS_IMAGE_PROXY_ORIGIN}/${targetUrl.host}${targetUrl.pathname}`)
    wordpressUrl.searchParams.set('ssl', '1')
    // Photon forwards the source query via q. Dropping it breaks signed URLs
    // and pins a random endpoint to a single cached image.
    if (targetUrl.search) {
      wordpressUrl.searchParams.set('q', targetUrl.search.slice(1))
    }
    proxyUrls.push(wordpressUrl.toString())
  }

  proxyUrls.push(`${FALLBACK_IMAGE_PROXY_ORIGIN}/${normalizedSourceUrl}`)
  return proxyUrls
}

async function fetchImageBlob(fetchUrl: string, sourceUrl: string, init: RequestInit) {
  const response = await fetchWithTimeout(fetchUrl, init, isOnaniBackgroundUrl(fetchUrl) ? 45000 : FETCH_TIMEOUT_MS)
  if (!response.ok) {
    throw new Error(`Failed to fetch background image: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Background response is not an image: ${contentType}`)
  }

  const blob = await response.blob()
  if (blob.size === 0) {
    throw new Error('Background response is empty')
  }

  let originalDownloadUrl: string | undefined
  if (isOnaniBackgroundUrl(fetchUrl) && response.headers.get('x-onani-preview') === 'webp') {
    const original = response.headers.get('x-onani-original') ?? ''
    if (!/^\/api\/plugins\/onani\/background\/[a-f0-9]{64}\/original$/.test(original)) {
      throw new Error('Onani preview is missing its original image URL')
    }
    originalDownloadUrl = new URL(original, window.location.origin).toString()
  }
  return { blob, sourceUrl, originalDownloadUrl }
}

export function isOnaniBackgroundUrl(value: string) {
  try {
    const url = new URL(value, window.location.href)
    return url.origin === window.location.origin && url.pathname === '/api/plugins/onani/background'
  }
  catch {
    return false
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    // Consume while the abort deadline is active; slow bodies must not bypass it.
    const body = await response.blob()
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      headers: response.headers,
      blob: async () => body,
      text: () => body.text(),
    }
  }
  finally {
    window.clearTimeout(timeout)
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

function shouldPreferReadableProxy(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname === 'tc.alcy.cc'
  }
  catch {
    return false
  }
}

function shouldUseClientJsonResolver(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl, window.location.href)
    return url.hostname === 't.alcy.cc' && ALCY_RANDOM_PATH.test(url.pathname)
  }
  catch {
    return false
  }
}

function isSameOrigin(sourceUrl: string) {
  try {
    return new URL(sourceUrl).origin === window.location.origin
  }
  catch {
    return false
  }
}

function isPublicProxyTarget(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    normalizedHostname === 'localhost'
    || normalizedHostname.includes(':')
    || !normalizedHostname.includes('.')
    || normalizedHostname.endsWith('.home')
    || normalizedHostname.endsWith('.internal')
    || normalizedHostname.endsWith('.invalid')
    || normalizedHostname.endsWith('.lan')
    || normalizedHostname.endsWith('.local')
    || normalizedHostname.endsWith('.localhost')
    || normalizedHostname.endsWith('.test')
  ) {
    return false
  }

  const ipv4Parts = normalizedHostname.split('.').map(Number)
  if (ipv4Parts.length !== 4 || ipv4Parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }

  const first = ipv4Parts[0] ?? -1
  const second = ipv4Parts[1] ?? -1
  return !(
    first === 0
    || first === 10
    || (first === 100 && second >= 64 && second <= 127)
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224
  )
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
