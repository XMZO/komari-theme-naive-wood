import type { SettingsRecord } from './schema'

export interface LoadedThemeSettings {
  theme: string
  sitename: string
  loggedIn: boolean
  settings: SettingsRecord
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

async function requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init })
  const text = await response.text()
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

export async function loadThemeSettings(): Promise<LoadedThemeSettings> {
  const [publicInfo, me] = await Promise.all([requestJson('/api/public'), requestJson('/api/me')])
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
