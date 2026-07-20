/**
 * Komari RPC2 Client SDK
 * @see https://www.komari.wiki/dev/rpc.html
 */

import type { RpcCollection } from '@/utils/rpcCompatibility'
import { normalizeRpcCollection, RpcCompatibilityError } from '@/utils/rpcCompatibility'

// ==================== 类型定义 ====================

/** JSON-RPC 2.0 请求结构 */
interface JsonRpcRequest {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown> | unknown[]
  id: number | string
}

/** JSON-RPC 2.0 成功响应 */
interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: '2.0'
  result: T
  id: number | string
}

/** JSON-RPC 2.0 错误响应 */
interface JsonRpcErrorResponse {
  jsonrpc: '2.0'
  error: {
    code: number
    message: string
    data?: unknown
  }
  id: number | string | null
}

/** JSON-RPC 2.0 响应 */
type JsonRpcResponse<T = unknown> = JsonRpcSuccessResponse<T> | JsonRpcErrorResponse

/** RPC 方法元数据 */
export interface MethodMeta {
  name: string
  summary?: string
  description?: string
  params?: ParamMeta[]
  returns?: string
  example?: unknown
}

/** 参数元数据 */
export interface ParamMeta {
  name: string
  type?: string
  required?: boolean
  description?: string
}

/** 节点客户端信息 */
export interface Client {
  uuid: string
  token?: string
  name: string
  cpu_name: string
  virtualization: string
  arch: string
  cpu_cores: number
  cpu_physical_cores?: number
  os: string
  kernel_version: string
  gpu_name?: string
  ipv4?: string
  ipv6?: string
  region: string
  remark?: string
  public_remark?: string
  mem_total: number
  swap_total: number
  disk_total: number
  version?: string
  weight: number
  price: number
  billing_cycle: number
  auto_renewal: boolean
  currency: string
  expired_at: string | null
  group: string
  tags: string
  hidden: boolean
  traffic_limit: number
  traffic_limit_type: string
  created_at: string
  updated_at: string
}

/** 公开站点信息 */
export interface PublicInfo {
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
}

/** 版本信息 */
export interface VersionInfo {
  version: string
  hash: string
}

/** 节点状态 */
export interface NodeStatus {
  client: string
  time: string
  cpu: number
  gpu: number
  ram: number
  ram_total: number
  swap: number
  swap_total: number
  load: number
  load5: number
  load15: number
  temp: number
  disk: number
  disk_total: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
  online: boolean
  uptime: number
  ping?: Record<string, {
    name: string
    latest: number
    avg: number
    tail: number
    loss: number
    min: number
    max: number
  }>
}

/** 状态记录 */
export interface StatusRecord {
  client: string
  time: string
  cpu: number
  gpu: number
  ram: number
  ram_total: number
  swap: number
  swap_total: number
  load: number
  load5?: number
  load15?: number
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

/** Ping 记录 */
export interface PingRecord {
  client: string
  task_id: number
  time: string
  value: number
}

export interface PublicPingTask {
  id: number
  name: string
  clients: string[]
  default_on: boolean
  type: string
  interval: number
}

/** Metric 定义（Komari 1.2.6+） */
export interface MetricDefinition {
  name: string
  description?: string | Record<string, string>
  type: string
  unit?: string
  retention_days: number
  metadata?: Record<string, string>
  created_at?: string
  updated_at?: string
}

export type MetricAggregation = 'avg' | 'min' | 'max' | 'sum' | 'count' | 'p50' | 'p95' | 'p99' | 'first' | 'last' | 'rate' | 'stddev'

export interface MetricPoint {
  time: string
  value: number | null
  count?: number
  tag?: Record<string, string>
  tags?: Record<string, string>
  labels?: Record<string, string>
}

export interface MetricSeries {
  metric_key: string
  entity_id: string
  type?: string
  unit?: string
  retention_days?: number
  tag?: Record<string, string>
  tags?: Record<string, string>
  downsampled: boolean
  downsample_algorithm?: string
  fill_empty?: boolean
  max_points?: number
  interval_seconds?: number
  count: number
  points: MetricPoint[]
}

export interface MetricQueryParams {
  metric_key?: string
  metric_keys?: string[]
  metrics?: string[]
  entity_id?: string
  entity_ids?: string[]
  start?: string | number
  start_time?: string | number
  end?: string | number
  end_time?: string | number
  hours?: number
  tags?: Record<string, string>
  downsample?: boolean
  server_downsample?: boolean
  downsample_by_metric?: Record<string, boolean>
  server_downsample_by_metric?: Record<string, boolean>
  fill_empty?: boolean
  max_points?: number
  downsample_points?: number
  max_points_by_metric?: Record<string, number>
  points_by_metric?: Record<string, number>
  aggregation?: MetricAggregation
  downsample_algorithm?: MetricAggregation
  algorithm?: MetricAggregation
  aggregation_by_metric?: Record<string, MetricAggregation>
  downsample_algorithm_by_metric?: Record<string, MetricAggregation>
  algorithm_by_metric?: Record<string, MetricAggregation>
}

export interface MetricQueryResponse {
  start: string
  end: string
  server_downsample_default: boolean
  default_points: number
  series: MetricSeries[]
  count: number
}

export interface PingMetricTaskStats {
  entity_id: string
  task_id: string
  name?: string
  type?: string
  interval?: number
  tags?: Record<string, string>
  total: number
  valid: number
  loss: number
  loss_approximate?: boolean
  min?: number | null
  max?: number | null
  avg?: number | null
  latest?: number | null
  p50?: number | null
  p99?: number | null
  stddev?: number | null
  p99_p50_ratio: number
}

export interface PingMetricStatsParams {
  uuid?: string
  entity_id?: string
  entity_ids?: string[]
  task_id?: string | number
  task_ids?: Array<string | number>
  start?: string | number
  start_time?: string | number
  end?: string | number
  end_time?: string | number
  hours?: number
  max_points?: number
  downsample_points?: number
}

export interface PingMetricStatsResponse {
  start: string
  end: string
  interval_seconds?: number
  stats: PingMetricTaskStats[]
  count: number
}

export interface VisitorAuditEvent {
  event: string
  path?: string
  route?: string
  target?: string
  detail?: Record<string, unknown>
}

/** RPC 错误 */
export class RpcError extends Error {
  code: number
  data?: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'RpcError'
    this.code = code
    this.data = data
  }
}

export type RpcTransportErrorKind = 'network' | 'timeout' | 'http' | 'websocket' | 'closed' | 'protocol'

/** 传输层错误，与服务端 JSON-RPC 业务错误分离。 */
export class RpcTransportError extends Error {
  kind: RpcTransportErrorKind
  httpStatus?: number
  data?: unknown

  constructor(kind: RpcTransportErrorKind, message: string, options: { httpStatus?: number, data?: unknown } = {}) {
    super(message)
    this.name = 'RpcTransportError'
    this.kind = kind
    this.httpStatus = options.httpStatus
    this.data = options.data
  }
}

export const RPC_ERROR_METHOD_NOT_FOUND = -32601
export const RPC_ERROR_UNAUTHENTICATED = -32040
export const RPC_ERROR_PERMISSION_DENIED = -32041

export function isRpcMethodUnavailable(error: unknown): boolean {
  return error instanceof RpcError
    && (error.code === RPC_ERROR_METHOD_NOT_FOUND || /method not found/i.test(error.message))
}

export function isRpcAuthenticationError(error: unknown): boolean {
  if (error instanceof RpcTransportError) {
    return error.httpStatus === 401
  }
  return error instanceof RpcError
    && (error.code === 401
      || error.code === RPC_ERROR_UNAUTHENTICATED
      || (error.code === RPC_ERROR_PERMISSION_DENIED && /private site|login|unauthenticated/i.test(error.message)))
}

/** RpcClient 配置选项 */
export interface RpcClientOptions {
  baseUrl?: string
  timeout?: number
  /** 是否使用 WebSocket，默认 false */
  useWebSocket?: boolean
}

/** JSON-RPC 2.0 客户端 */
export class RpcClient {
  private baseUrl: string
  private timeout: number
  private useWebSocket: boolean
  private ws: WebSocket | null = null
  private pendingRequests: Map<number | string, {
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
    timer: ReturnType<typeof setTimeout>
  }> = new Map()

  private requestId = 0
  /** WebSocket 连接 Promise（用于等待正在进行的连接） */
  private wsConnectPromise: Promise<void> | null = null
  private wsCloseListeners = new Set<(event: CloseEvent) => void>()
  private wsErrorListeners = new Set<(event: Event) => void>()

  constructor(options: RpcClientOptions = {}) {
    const apiBase = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
    this.baseUrl = options.baseUrl || `${apiBase}/rpc2`
    this.timeout = options.timeout || 30000
    this.useWebSocket = options.useWebSocket || false
  }

  /**
   * 调用 RPC 方法（HTTP POST）
   */
  private async callHttp<T>(method: string, params?: Record<string, unknown> | unknown[]): Promise<T> {
    const id = ++this.requestId
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      const rawBody = await response.text()
      clearTimeout(timeoutId)
      let data: JsonRpcResponse<T> | Record<string, unknown> | null = null
      if (rawBody) {
        try {
          data = JSON.parse(rawBody)
        }
        catch {
          if (response.ok) {
            throw new RpcTransportError('protocol', 'RPC response is not valid JSON', { data: rawBody })
          }
        }
      }

      if (!response.ok) {
        const message = data && typeof data === 'object'
          ? String(('message' in data && data.message) || ('error' in data && data.error) || response.statusText || `HTTP ${response.status}`)
          : response.statusText || `HTTP ${response.status}`
        throw new RpcTransportError('http', message, { httpStatus: response.status, data })
      }

      if (!data || !('jsonrpc' in data)) {
        throw new RpcTransportError('protocol', 'RPC response has an unexpected shape', { data })
      }
      return this.handleResponse(data as JsonRpcResponse<T>)
    }
    catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof RpcError || error instanceof RpcTransportError)
        throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new RpcTransportError('timeout', `RPC request timed out after ${this.timeout}ms`)
      }
      throw new RpcTransportError('network', `Network error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 确保 WebSocket 连接已建立并就绪
   * 如果已有连接正在建立中，等待其完成
   */
  private async ensureWebSocketReady(): Promise<void> {
    // 已连接，直接返回
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    // 有正在进行的连接，等待它
    if (this.wsConnectPromise) {
      return this.wsConnectPromise
    }

    // 创建新连接
    const connectPromise = this.initWebSocket()
    this.wsConnectPromise = connectPromise
    try {
      await connectPromise
    }
    finally {
      if (this.wsConnectPromise === connectPromise) {
        this.wsConnectPromise = null
      }
    }
  }

  private async waitForWebSocketReady(timeout: number): Promise<void> {
    const readyPromise = this.ensureWebSocketReady()
    const attemptSocket = this.ws
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        readyPromise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new RpcTransportError('timeout', `WebSocket connection timed out after ${timeout}ms`))
          }, timeout)
        }),
      ])
    }
    catch (error) {
      if (error instanceof RpcTransportError
        && error.kind === 'timeout'
        && this.ws === attemptSocket) {
        attemptSocket?.close()
      }
      throw error
    }
    finally {
      if (timeoutId)
        clearTimeout(timeoutId)
    }
  }

  /**
   * 初始化 WebSocket 连接
   */
  private initWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace(/^http/, 'ws').replace(/^https/, 'wss')

      const socket = new WebSocket(wsUrl)
      let settled = false
      this.ws = socket

      socket.onopen = () => {
        if (this.ws !== socket)
          return
        settled = true
        resolve()
      }

      socket.onerror = (event) => {
        if (this.ws === socket) {
          this.wsErrorListeners.forEach(listener => listener(event))
        }
        if (!settled) {
          settled = true
          reject(new RpcTransportError('websocket', 'WebSocket connection error'))
          if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
            socket.close()
          }
        }
      }

      socket.onmessage = (event) => {
        try {
          const data: JsonRpcResponse = JSON.parse(event.data)
          if (data.id === null)
            return
          const pending = this.pendingRequests.get(data.id)
          if (pending) {
            clearTimeout(pending.timer)
            this.pendingRequests.delete(data.id)
            try {
              pending.resolve(this.handleResponse(data))
            }
            catch (error) {
              pending.reject(error)
            }
          }
        }
        catch {
          // Ignore parse errors
        }
      }

      socket.onclose = (event) => {
        const isCurrentSocket = this.ws === socket
        if (isCurrentSocket) {
          this.ws = null
          this.rejectPendingRequests(new RpcTransportError('closed', 'WebSocket closed'))
        }
        if (!settled) {
          settled = true
          reject(new RpcTransportError('closed', 'WebSocket closed before ready'))
        }
        if (isCurrentSocket) {
          this.wsCloseListeners.forEach(listener => listener(event))
        }
      }
    })
  }

  private rejectPendingRequests(error: RpcError | RpcTransportError): void {
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timer)
      pending.reject(error)
    })
    this.pendingRequests.clear()
  }

  /**
   * 调用 RPC 方法（WebSocket）
   */
  private async callWebSocket<T>(method: string, params?: Record<string, unknown> | unknown[], timeout = this.timeout): Promise<T> {
    const deadline = Date.now() + timeout
    await this.waitForWebSocketReady(timeout)
    const responseTimeout = Math.max(1, deadline - Date.now())

    return new Promise((resolve, reject) => {
      const id = ++this.requestId
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method,
        params,
        id,
      }

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new RpcTransportError('timeout', `RPC request timed out after ${timeout}ms`))
      }, responseTimeout)

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })

      // 此时 WebSocket 应该已经打开
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(request))
        }
        catch (error) {
          this.pendingRequests.delete(id)
          clearTimeout(timer)
          reject(new RpcTransportError('websocket', `WebSocket send failed: ${error instanceof Error ? error.message : String(error)}`))
        }
      }
      else {
        // 异常情况：连接断开了，拒绝请求
        this.pendingRequests.delete(id)
        clearTimeout(timer)
        reject(new RpcTransportError('closed', 'WebSocket not connected'))
      }
    })
  }

  /**
   * 处理响应
   */
  private handleResponse<T>(response: JsonRpcResponse<T>): T {
    if ('error' in response) {
      throw new RpcError(response.error.code, response.error.message, response.error.data)
    }
    return response.result
  }

  /**
   * 调用 RPC 方法
   */
  async call<T>(method: string, params?: Record<string, unknown> | unknown[]): Promise<T> {
    if (this.useWebSocket) {
      return this.callWebSocket<T>(method, params)
    }
    return this.callHttp<T>(method, params)
  }

  /**
   * 切换传输方式
   */
  setTransport(useWebSocket: boolean): void {
    this.useWebSocket = useWebSocket
    if (!useWebSocket) {
      this.closeWebSocketAttempt()
    }
  }

  private closeWebSocketAttempt(): void {
    const socket = this.ws
    this.ws = null
    this.wsConnectPromise = null
    if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
      socket.close()
    }
    this.rejectPendingRequests(new RpcTransportError('closed', 'WebSocket closed'))
  }

  /**
   * 确保 WebSocket 连接已建立
   */
  async ensureWebSocketConnected(): Promise<void> {
    await this.waitForWebSocketReady(this.timeout)
  }

  /**
   * 确保 WebSocket 连接已建立并通过 ping 验证
   */
  async ensureWebSocketConnectedWithPing(timeoutMs = 10000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    await this.waitForWebSocketReady(timeoutMs)
    await this.callWebSocket<string>('rpc.ping', undefined, Math.max(1, deadline - Date.now()))
  }

  /**
   * 关闭连接
   */
  close(): void {
    this.useWebSocket = false
    this.closeWebSocketAttempt()
  }

  /** 订阅 WebSocket 关闭事件，不覆盖客户端内部清理逻辑 */
  onWebSocketClose(listener: (event: CloseEvent) => void): () => void {
    this.wsCloseListeners.add(listener)
    return () => this.wsCloseListeners.delete(listener)
  }

  /** 订阅 WebSocket 错误事件 */
  onWebSocketError(listener: (event: Event) => void): () => void {
    this.wsErrorListeners.add(listener)
    return () => this.wsErrorListeners.delete(listener)
  }

  /**
   * 获取 WebSocket 连接状态
   */
  getWsReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  /**
   * 获取 WebSocket 实例（用于状态监控）
   */
  getWebSocket(): WebSocket | null {
    return this.ws
  }
}

// ==================== KomariRpc 类 ====================

/**
 * Komari RPC 高级封装
 * 提供常用的 Komari API 方法
 */
export class KomariRpc {
  private client: RpcClient

  constructor(options: RpcClientOptions = {}) {
    this.client = new RpcClient(options)
  }

  /**
   * 获取底层 RpcClient 实例
   */
  getClient(): RpcClient {
    return this.client
  }

  private async callWithLegacyFallback<T>(primaryMethod: string, legacyMethod: string, params?: Record<string, unknown>): Promise<T> {
    try {
      return await this.client.call<T>(primaryMethod, params)
    }
    catch (error) {
      if (!isRpcMethodUnavailable(error))
        throw error
      return this.client.call<T>(legacyMethod, params)
    }
  }

  private async callCollection<T>(method: string, getKey: (item: T) => unknown): Promise<Record<string, T>> {
    const payload = await this.client.call<RpcCollection<T>>(method)
    try {
      return normalizeRpcCollection<T>(payload, method, getKey)
    }
    catch (error) {
      if (error instanceof RpcCompatibilityError)
        throw new RpcTransportError('protocol', error.message)
      throw error
    }
  }

  // ==================== 内置方法 ====================

  /**
   * 获取所有可用方法
   */
  async getMethods(includeInternal = false): Promise<string[]> {
    return this.client.call<string[]>('rpc.methods', { internal: includeInternal })
  }

  /**
   * 获取帮助信息
   */
  async getHelp(method?: string): Promise<MethodMeta[] | MethodMeta> {
    return this.client.call<MethodMeta[] | MethodMeta>('rpc.help', method ? { method } : undefined)
  }

  /**
   * Ping 测试
   */
  async ping(): Promise<string> {
    return this.client.call<string>('rpc.ping')
  }

  /**
   * 获取版本信息
   */
  async getProtocolVersion(): Promise<string> {
    return this.client.call<string>('rpc.version')
  }

  /** 获取 Komari 服务端版本，优先使用新的 public 命名空间 */
  async getVersion(): Promise<VersionInfo> {
    try {
      return await this.client.call<VersionInfo>('public:getVersion')
    }
    catch (error) {
      if (!isRpcMethodUnavailable(error))
        throw error
    }

    return this.client.call<VersionInfo>('common:getVersion')
  }

  // ==================== 通用方法 ====================

  /**
   * 获取所有节点信息
   * 兼容 1.2.5-fix1 的有序数组与其他版本的 UUID 字典。
   */
  async getNodes(): Promise<Record<string, Client>> {
    return this.callCollection<Client>('common:getNodes', client => client.uuid)
  }

  /**
   * 获取所有节点最新状态
   */
  async getNodesLatestStatus(): Promise<Record<string, NodeStatus>> {
    return this.callCollection<NodeStatus>('common:getNodesLatestStatus', status => status.client)
  }

  async getPublicPingTasks(): Promise<PublicPingTask[]> {
    return this.client.call<PublicPingTask[]>('public:getPublicPingTasks')
  }

  /**
   * 获取节点最近状态记录
   */
  async getNodeRecentStatus(uuid: string): Promise<{ count: number, records: StatusRecord[] }> {
    return this.client.call<{ count: number, records: StatusRecord[] }>('common:getNodeRecentStatus', { uuid })
  }

  /**
   * 获取公开的站点信息
   */
  async getPublicInfo(): Promise<PublicInfo> {
    return this.callWithLegacyFallback<PublicInfo>('public:getPublicSettings', 'common:getPublicInfo')
  }

  /**
   * 获取后端版本
   */
  async getBackendVersion(): Promise<VersionInfo> {
    return this.getVersion()
  }

  // ==================== Metric API（Komari 1.2.6+） ====================

  async listMetricDefinitions(): Promise<MetricDefinition[]> {
    return this.client.call<MetricDefinition[]>('public:listMetricDefinitions')
  }

  async queryMetrics(params: MetricQueryParams): Promise<MetricQueryResponse> {
    return this.client.call<MetricQueryResponse>('public:queryMetrics', params as Record<string, unknown>)
  }

  async getPingMetricStats(params: PingMetricStatsParams): Promise<PingMetricStatsResponse> {
    return this.client.call<PingMetricStatsResponse>('public:getPingMetricStats', params as Record<string, unknown>)
  }

  async recordVisitorEvent(event: VisitorAuditEvent): Promise<{ status: string }> {
    return this.client.call<{ status: string }>('public:recordVisitorEvent', { ...event })
  }

  // ==================== 历史记录方法 ====================

  /**
   * 获取历史记录（通用方法）
   */
  async getRecords(params: {
    type: 'load' | 'ping'
    uuid?: string
    hours?: number
    task_id?: number
    load_type?: string
    maxCount?: number
  }): Promise<unknown> {
    return this.client.call('common:getRecords', params)
  }

  /**
   * 获取负载记录
   */
  async getLoadRecords(uuid?: string, hours?: number, loadType?: string, maxCount?: number): Promise<{
    count: number
    records: Record<string, StatusRecord[]>
    from: string
    to: string
  }> {
    return this.client.call('common:getRecords', {
      type: 'load',
      uuid,
      hours,
      load_type: loadType,
      maxCount,
    })
  }

  /**
   * 获取 Ping 记录
   */
  async getPingRecords(taskId?: number, hours?: number, maxCount?: number): Promise<{ records: PingRecord[] }> {
    return this.client.call<{ records: PingRecord[] }>('common:getRecords', {
      type: 'ping',
      task_id: taskId,
      hours,
      maxCount,
    })
  }

  /**
   * 关闭连接
   */
  close(): void {
    this.client.close()
  }
}

// ==================== 单例 ====================

let sharedRpc: KomariRpc | null = null

/**
 * 获取共享的 KomariRpc 实例
 */
export function getSharedRpc(): KomariRpc {
  if (!sharedRpc) {
    sharedRpc = new KomariRpc()
  }
  return sharedRpc
}

/**
 * 重置共享实例
 */
export function resetSharedRpc(): void {
  if (sharedRpc) {
    sharedRpc.close()
    sharedRpc = null
  }
}
