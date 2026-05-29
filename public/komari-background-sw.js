globalThis.addEventListener('install', (event) => {
  event.waitUntil(globalThis.skipWaiting())
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      cleanupOldCaches(),
      globalThis.clients.claim(),
    ]),
  )
})

const CACHE_NAME = 'komari-background-cache-v1'
const CACHE_PREFIX = '/__komari_background_cache__/'
const PROXY_PREFIX = '/__komari_background__/'
const MAX_CACHE_ENTRIES = 8

globalThis.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  if (!requestUrl.pathname.includes(PROXY_PREFIX)) {
    return
  }

  event.respondWith(handleBackgroundRequest(event.request, requestUrl))
})

async function cleanupOldCaches() {
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter(key => key.startsWith('komari-background-cache-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)),
  )
}

async function handleBackgroundRequest(request, requestUrl) {
  const targetUrl = requestUrl.searchParams.get('url')
  const key = requestUrl.searchParams.get('key')

  if (!targetUrl || !key || !isValidHttpUrl(targetUrl)) {
    return new Response('Invalid background cache request', { status: 400 })
  }

  const cache = await caches.open(CACHE_NAME)
  const cacheRequest = createCacheRequest(requestUrl.origin, key)
  const cached = await cache.match(cacheRequest)

  if (cached) {
    return cached
  }

  const response = await fetch(targetUrl, {
    cache: 'no-store',
    credentials: 'omit',
    mode: 'no-cors',
    redirect: 'follow',
  })

  if (!response || (response.type !== 'opaque' && !response.ok)) {
    return new Response('Failed to load background', { status: 502 })
  }

  await cache.put(cacheRequest, response.clone())
  await trimCache(cache)
  return response
}

function createCacheRequest(origin, key) {
  return new Request(`${origin}${CACHE_PREFIX}${encodeURIComponent(key)}`)
}

async function trimCache(cache) {
  const keys = await cache.keys()
  if (keys.length <= MAX_CACHE_ENTRIES) {
    return
  }

  await Promise.all(keys.slice(0, keys.length - MAX_CACHE_ENTRIES).map(key => cache.delete(key)))
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
}
