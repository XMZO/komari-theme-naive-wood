import type { SettingsRecord } from './schema'

export interface LoadedThemeSettings {
  theme: string
  sitename: string
  loggedIn: boolean
  settings: SettingsRecord
}

interface PrefetchedResponse {
  ok: boolean
  status: number
  text: string
}

declare global {
  interface Window {
    __NAIVE_SETTINGS_PREFETCH__?: Array<Promise<PrefetchedResponse | null>>
  }
}

export class SettingsRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'SettingsRequestError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function request(path: string, init: RequestInit = {}): Promise<PrefetchedResponse> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init })
  return { ok: response.ok, status: response.status, text: await response.text() }
}

function parseResponse(response: PrefetchedResponse): unknown {
  const { text } = response
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  }
  catch {
    // 非 JSON 响应按状态码处理
  }
  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === 'string' && body.message ? body.message : `HTTP ${response.status}`
    throw new SettingsRequestError(message, response.status)
  }
  // Komari 的大部分接口包裹在 { status, message, data } 中，/api/me 例外。
  if (isRecord(body) && 'status' in body && 'data' in body) {
    if (body.status !== 'success') {
      throw new SettingsRequestError(typeof body.message === 'string' ? body.message : '请求失败', response.status)
    }
    return body.data
  }
  return body
}

async function requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
  return parseResponse(await request(path, init))
}

export async function loadThemeSettings(): Promise<LoadedThemeSettings> {
  // 页面内联脚本提前发出的请求只用一次，重试时重新请求
  const prefetch = window.__NAIVE_SETTINGS_PREFETCH__
  window.__NAIVE_SETTINGS_PREFETCH__ = undefined
  const load = async (index: number, path: string) => parseResponse((await prefetch?.[index]) ?? await request(path))
  const [publicInfo, me] = await Promise.all([load(0, '/api/public'), load(1, '/api/me')])
  const info = isRecord(publicInfo) ? publicInfo : {}
  return {
    theme: typeof info.theme === 'string' ? info.theme : '',
    sitename: typeof info.sitename === 'string' ? info.sitename : '',
    loggedIn: isRecord(me) && me.logged_in === true,
    settings: isRecord(info.theme_settings) ? info.theme_settings : {},
  }
}

export async function saveThemeSettings(theme: string, settings: SettingsRecord): Promise<void> {
  await requestJson(`/api/admin/theme/settings?theme=${encodeURIComponent(theme)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}
