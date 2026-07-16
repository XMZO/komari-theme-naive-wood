/**
 * Komari API 客户端 SDK
 * 基于 REST API 的 Komari 客户端
 * @see https://www.komari.wiki/dev/api.html
 */

// ==================== 类型定义 ====================

/** 用户信息 */
export interface MeInfo {
  'logged_in': boolean
  'username': string
  '2fa_enabled'?: boolean
  'sso_id'?: string
  'sso_type'?: string
  'uuid'?: string
}

/** 公开站点属性 */
export interface PublicSettings {
  /** @deprecated Komari 新版本已改用 cors_origin_check_enabled */
  allow_cors?: boolean
  cors_origin_check_enabled?: boolean
  visitor_audit_enabled?: boolean
  custom_body: string
  custom_head: string
  description: string
  disable_password_login: boolean
  oauth_enable: boolean
  oauth_provider: string | null
  ping_record_preserve_time?: number
  private_site: boolean
  record_enabled?: boolean
  record_preserve_time?: number
  /** @deprecated 仅 Komari 1.2.6 短期暴露，主题不得依赖 */
  metric_retention_days?: number
  sitename: string
  theme: string
  theme_settings?: Record<string, unknown> | null
  /** 数据更新间隔（秒），主题配置项 */
  dataUpdateInterval?: number
}

/** 版本信息 */
export interface VersionInfo {
  hash: string
  version: string
}

/** 节点信息 */
export interface NodeInfo {
  uuid: string
  name: string
  cpu_name: string
  virtualization: string
  arch: string
  cpu_cores: number
  cpu_physical_cores?: number
  os: string
  kernel_version: string
  gpu_name: string
  region: string
  mem_total: number
  swap_total: number
  disk_total: number
  weight: number
  price: number
  billing_cycle: number
  auto_renewal: boolean
  currency: string
  expired_at: string | null
  group: string
  tags: string
  public_remark?: string
  hidden: boolean
  traffic_limit: number
  traffic_limit_type: string
  created_at: string
  updated_at: string
}

/** 实时状态数据（嵌套结构） */
export interface RealtimeStatus {
  cpu: {
    usage: number
  }
  ram: {
    total: number
    used: number
  }
  swap: {
    total: number
    used: number
  }
  load: {
    load1: number
    load5: number
    load15: number
  }
  disk: {
    total: number
    used: number
  }
  network: {
    up: number
    down: number
    totalUp: number
    totalDown: number
  }
  connections: {
    tcp: number
    udp: number
  }
  uptime: number
  process: number
  message: string
  updated_at: string
}

/** 负载历史记录（扁平结构） */
export interface LoadRecord {
  client: string
  time: string
  cpu: number
  gpu: number
  ram: number
  ram_total: number
  swap: number
  swap_total: number
  load: number
  temp: number
  disk: number
  disk_total: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  traffic_up?: number
  traffic_down?: number
  process: number
  connections: number
  connections_udp: number
}

/** 负载历史记录响应 */
export interface LoadRecordsResponse {
  count: number
  records: LoadRecord[]
}

/** Ping 历史记录 */
export interface PingRecord {
  task_id: number
  time: string
  value: number
}

/** Ping 任务信息 */
export interface PingTask {
  id: number
  interval: number
  name: string
  loss: number
}

/** Ping 历史记录响应 */
export interface PingRecordsResponse {
  count: number
  records: PingRecord[]
  tasks: PingTask[]
}

/** 登录请求 */
export interface LoginRequest {
  'username': string
  'password': string
  '2fa_code'?: string
}

/** API 客户端配置 */
export interface ApiClientOptions {
  /** 基础路径，默认 '/api' */
  baseUrl?: string
  /** 超时时间（毫秒），默认 30000 */
  timeout?: number
}

/** API 错误 */
export class ApiError extends Error {
  status: string
  code?: number
  httpStatus?: number
  kind: 'http' | 'network' | 'timeout' | 'protocol' | 'unauthenticated' | 'forbidden' | 'invalid_credentials' | 'two_factor_required' | 'two_factor_invalid' | 'password_login_disabled'
  data?: unknown

  constructor(
    message: string,
    status: string = 'error',
    code?: number,
    options: {
      kind?: ApiError['kind']
      data?: unknown
    } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.httpStatus = code
    this.kind = options.kind ?? classifyApiError(message, code)
    this.data = options.data
  }
}

function classifyApiError(message: string, httpStatus?: number): ApiError['kind'] {
  const normalized = message.toLowerCase()
  if (normalized.includes('2fa code is required') || normalized.includes('two factor code is required'))
    return 'two_factor_required'
  if (normalized.includes('invalid 2fa') || normalized.includes('invalid two factor'))
    return 'two_factor_invalid'
  if (normalized.includes('password login') && (normalized.includes('disabled') || normalized.includes('disable')))
    return 'password_login_disabled'
  if (normalized.includes('invalid credentials'))
    return 'invalid_credentials'
  if (httpStatus === 401)
    return 'unauthenticated'
  if (httpStatus === 403)
    return 'forbidden'
  return 'http'
}

// ==================== API 客户端 ====================

/** Komari API 客户端 */
export class KomariApi {
  private baseUrl: string
  private timeout: number

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl || import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
    this.timeout = options.timeout || 30000
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...init,
        credentials: 'include',
        signal: controller.signal,
      })
      const rawBody = await response.text()
      let payload: unknown = null
      if (rawBody) {
        try {
          payload = JSON.parse(rawBody)
        }
        catch {
          if (response.ok) {
            throw new ApiError('API response is not valid JSON', 'error', response.status, {
              kind: 'protocol',
              data: rawBody,
            })
          }
          payload = rawBody
        }
      }

      const responseObject = payload && typeof payload === 'object'
        ? payload as Record<string, unknown>
        : null
      const apiStatus = responseObject && typeof responseObject.status === 'string'
        ? responseObject.status
        : undefined
      const message = responseObject
        ? String(responseObject.message ?? responseObject.error ?? response.statusText ?? `HTTP ${response.status}`)
        : response.statusText || (typeof payload === 'string' ? payload : `HTTP ${response.status}`)

      if (!response.ok || apiStatus === 'error') {
        throw new ApiError(message, apiStatus ?? 'error', response.status, { data: payload })
      }

      if (responseObject && apiStatus === 'success' && 'data' in responseObject) {
        return responseObject.data as T
      }

      return payload as T
    }
    catch (error) {
      if (error instanceof ApiError)
        throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(`Request timed out after ${this.timeout}ms`, 'error', undefined, { kind: 'timeout' })
      }
      throw new ApiError(`Network error: ${error instanceof Error ? error.message : String(error)}`, 'error', undefined, { kind: 'network' })
    }
    finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * 发送 GET 请求
   */
  private async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    let url = `${this.baseUrl}${path}`
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
      const queryString = searchParams.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    const requestPath = url.slice(this.baseUrl.length)
    return this.requestJson<T>(requestPath, { method: 'GET' })
  }

  /**
   * 发送 POST 请求
   */
  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.requestJson<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  // ===== 用户信息接口 =====

  /**
   * 获取当前用户信息
   * 注意：此接口返回的是直接的 MeInfo 对象，不是包裹在 { status, message, data } 中
   */
  async getMe(): Promise<MeInfo> {
    return this.get<MeInfo>('/me')
  }

  // ===== 服务端公开属性 =====

  /**
   * 获取站点的公开设置属性
   */
  async getPublicSettings(): Promise<PublicSettings> {
    return this.get<PublicSettings>('/public')
  }

  /**
   * 获取服务端版本信息
   */
  async getVersion(): Promise<VersionInfo> {
    return this.get<VersionInfo>('/version')
  }

  // ===== 登录/登出 =====

  /**
   * 用户登录
   * @param username 用户名
   * @param password 密码
   * @param twoFactorCode 两步验证码（可选）
   */
  async login(username: string, password: string, twoFactorCode?: string): Promise<{ 'set-cookie': { session_token: string } }> {
    const body: LoginRequest = { username, password }
    if (twoFactorCode) {
      body['2fa_code'] = twoFactorCode
    }
    return this.post<{ 'set-cookie': { session_token: string } }>('/login', body)
  }

  /**
   * 用户登出
   * 会重定向到首页
   */
  logout(): void {
    window.location.href = `${this.baseUrl}/logout`
  }

  /**
   * OAuth 登录
   * 会重定向到 OAuth 提供商
   */
  oauthLogin(): void {
    window.location.href = `${this.baseUrl}/oauth`
  }

  // ===== 节点信息 =====

  /**
   * 获取所有节点的基本信息列表
   */
  async getNodes(): Promise<NodeInfo[]> {
    return this.get<NodeInfo[]>('/nodes')
  }

  /**
   * 获取指定节点最近1分钟的历史数据
   * @param uuid 节点 UUID
   */
  async getNodeRecentStatus(uuid: string): Promise<RealtimeStatus[]> {
    return this.get<RealtimeStatus[]>(`/recent/${uuid}`)
  }

  // ===== 历史记录 =====

  /**
   * 获取指定节点的负载历史记录
   * @param uuid 节点 UUID
   * @param hours 查询时间范围（小时）
   */
  async getLoadRecords(uuid: string, hours: number): Promise<LoadRecordsResponse> {
    return this.get<LoadRecordsResponse>('/records/load', { uuid, hours })
  }

  /**
   * 获取指定节点的 Ping 历史记录
   * @param uuid 节点 UUID
   * @param hours 查询时间范围（小时）
   */
  async getPingRecords(uuid: string, hours: number): Promise<PingRecordsResponse> {
    return this.get<PingRecordsResponse>('/records/ping', { uuid, hours })
  }
}

// ==================== 单例实例 ====================

let sharedApiInstance: KomariApi | null = null

/**
 * 获取共享的 KomariApi 实例
 */
export function getSharedApi(options?: ApiClientOptions): KomariApi {
  if (!sharedApiInstance) {
    sharedApiInstance = new KomariApi(options)
  }
  return sharedApiInstance
}

/**
 * 重置共享实例
 */
export function resetSharedApi(): void {
  sharedApiInstance = null
}

// 默认导出
export default KomariApi
