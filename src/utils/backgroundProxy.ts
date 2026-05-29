const SERVICE_WORKER_PATH = '/komari-background-sw.js'
const PROXY_PREFIX = '/__komari_background__'

let serviceWorkerReadyPromise: Promise<boolean> | null = null

export type BackgroundProxyAction = 'image' | 'download'

export function createBackgroundProxyKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function getBackgroundProxyUrl(action: BackgroundProxyAction, targetUrl: string, key: string, filename?: string) {
  const proxyUrl = new URL(`${PROXY_PREFIX}/${action}`, window.location.origin)
  proxyUrl.searchParams.set('key', key)
  proxyUrl.searchParams.set('url', targetUrl)
  if (filename) {
    proxyUrl.searchParams.set('filename', filename)
  }
  return proxyUrl.toString()
}

export async function ensureBackgroundProxyReady() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    return false
  }

  if (!serviceWorkerReadyPromise) {
    serviceWorkerReadyPromise = registerBackgroundServiceWorker()
  }

  return serviceWorkerReadyPromise
}

async function registerBackgroundServiceWorker() {
  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' })
    await navigator.serviceWorker.ready

    if (navigator.serviceWorker.controller) {
      return true
    }

    return await waitForController()
  }
  catch {
    serviceWorkerReadyPromise = null
    return false
  }
}

function waitForController() {
  return new Promise<boolean>((resolve) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      resolve(Boolean(navigator.serviceWorker.controller))
    }, 3000)

    function handleControllerChange() {
      window.clearTimeout(timeout)
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      resolve(true)
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
  })
}
