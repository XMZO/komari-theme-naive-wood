import type { RecordFormat } from '@/utils/recordHelper'
import type {
  MetricDefinition,
  MetricQueryParams,
  MetricQueryResponse,
  MetricSeries,
  PingMetricStatsParams,
  PingMetricStatsResponse,
} from '@/utils/rpc'
import { getSharedRpc, isRpcMethodUnavailable } from '@/utils/rpc'

export const METRIC_KEYS = {
  cpu: 'cpu.usage',
  gpu: 'gpu.usage',
  ram: 'memory.used',
  ramTotal: 'memory.total',
  swap: 'swap.used',
  swapTotal: 'swap.total',
  load: 'load.average',
  temperature: 'temperature',
  disk: 'disk.used',
  diskTotal: 'disk.total',
  netIn: 'net.in.rate',
  netOut: 'net.out.rate',
  netTotalUp: 'net.total.up',
  netTotalDown: 'net.total.down',
  trafficUp: 'traffic.up',
  trafficDown: 'traffic.down',
  process: 'process.count',
  connectionsTcp: 'connections.tcp',
  connectionsUdp: 'connections.udp',
  gpuDeviceUsage: 'gpu.device.usage',
  gpuMemoryUsed: 'gpu.memory.used',
  gpuMemoryTotal: 'gpu.memory.total',
  gpuTemperature: 'gpu.temperature',
  pingLatency: 'ping.latency_ms',
  pingLoss: 'ping.loss',
} as const

export const LOAD_HISTORY_METRIC_KEYS = [
  METRIC_KEYS.cpu,
  METRIC_KEYS.ram,
  METRIC_KEYS.ramTotal,
  METRIC_KEYS.swap,
  METRIC_KEYS.swapTotal,
  METRIC_KEYS.load,
  METRIC_KEYS.disk,
  METRIC_KEYS.diskTotal,
  METRIC_KEYS.netIn,
  METRIC_KEYS.netOut,
  METRIC_KEYS.process,
  METRIC_KEYS.connectionsTcp,
  METRIC_KEYS.connectionsUdp,
] as const

/** 决定负载页统一时间选择器的主要可见指标（静态 total 字段不参与限制）。 */
export const LOAD_RETENTION_METRIC_KEYS = [
  METRIC_KEYS.cpu,
  METRIC_KEYS.load,
  METRIC_KEYS.ram,
  METRIC_KEYS.swap,
  METRIC_KEYS.disk,
  METRIC_KEYS.netIn,
  METRIC_KEYS.netOut,
  METRIC_KEYS.process,
  METRIC_KEYS.connectionsTcp,
  METRIC_KEYS.connectionsUdp,
] as const

export const PING_HISTORY_METRIC_KEYS = [
  METRIC_KEYS.pingLatency,
  METRIC_KEYS.pingLoss,
] as const

const METRIC_DOWNSAMPLE_INTERVAL_SECONDS = [
  1,
  5,
  10,
  15,
  30,
  60,
  120,
  300,
  600,
  900,
  1800,
  3600,
  7200,
  10800,
  21600,
  43200,
  86400,
] as const

/**
 * Komari 会把 duration/max_points 向下取整到标准桶。若固定请求 600 点，
 * 短窗口的桶可能远小于真实上报间隔，fill_empty 会在每两个样本间插入大量 null，
 * 最终让隐藏 symbol、禁止跨空值连线的折线完全不可见。
 */
export function getMetricQueryMaxPoints(hours: number, sampleIntervalSeconds: number, limit = 600): number {
  const normalizedHours = Number.isFinite(hours) && hours > 0 ? hours : 1
  const durationSeconds = Math.max(1, normalizedHours * 3600)
  const normalizedSampleInterval = Number.isFinite(sampleIntervalSeconds) && sampleIntervalSeconds > 0
    ? sampleIntervalSeconds
    : 60
  const bucketInterval = METRIC_DOWNSAMPLE_INTERVAL_SECONDS.find(
    interval => interval >= normalizedSampleInterval,
  ) ?? 86400
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 600
  return Math.max(1, Math.min(safeLimit, Math.floor(durationSeconds / bucketInterval)))
}

let metricDefinitionsSupported: boolean | null = null
let metricQuerySupported: boolean | null = null
let pingMetricStatsSupported: boolean | null = null
let metricDefinitions: MetricDefinition[] | null = null
let metricDefinitionsLoadedAt = 0
let metricCompatibilityGeneration = 0

interface MetricDefinitionsRequest {
  generation: number
  promise: Promise<MetricDefinition[] | null>
}

let metricDefinitionsRequest: MetricDefinitionsRequest | null = null

const METRIC_COMPATIBILITY_CACHE_TTL_MS = 60_000

function isMetricCompatibilityCacheFresh(): boolean {
  return metricDefinitionsLoadedAt > 0
    && Date.now() - metricDefinitionsLoadedAt < METRIC_COMPATIBILITY_CACHE_TTL_MS
}

/**
 * 读取逐指标定义。仅在服务端明确返回 MethodNotFound 时回退旧兼容字段；
 * 网络、鉴权或数据库错误会继续抛出，避免用旧接口掩盖真实故障。
 */
export async function getMetricDefinitions(force = false): Promise<MetricDefinition[] | null> {
  if (!force && isMetricCompatibilityCacheFresh()) {
    return metricDefinitionsSupported === false ? null : metricDefinitions
  }
  if (metricDefinitionsRequest) {
    const activeRequest = metricDefinitionsRequest
    try {
      const definitions = await activeRequest.promise
      if (activeRequest.generation !== metricCompatibilityGeneration) {
        if (metricDefinitionsRequest === activeRequest) {
          metricDefinitionsRequest = null
        }
        return getMetricDefinitions()
      }
      return definitions
    }
    catch (error) {
      if (activeRequest.generation !== metricCompatibilityGeneration) {
        if (metricDefinitionsRequest === activeRequest) {
          metricDefinitionsRequest = null
        }
        return getMetricDefinitions()
      }
      throw error
    }
  }

  const requestGeneration = ++metricCompatibilityGeneration
  const request = (async () => {
    try {
      const definitions = await getSharedRpc().listMetricDefinitions()
      if (requestGeneration === metricCompatibilityGeneration) {
        metricDefinitionsSupported = true
        metricQuerySupported = null
        pingMetricStatsSupported = null
        metricDefinitions = definitions
        metricDefinitionsLoadedAt = Date.now()
      }
      return definitions
    }
    catch (error) {
      if (isRpcMethodUnavailable(error)) {
        if (requestGeneration === metricCompatibilityGeneration) {
          metricDefinitionsSupported = false
          metricQuerySupported = null
          pingMetricStatsSupported = null
          metricDefinitions = null
          metricDefinitionsLoadedAt = Date.now()
        }
        return null
      }
      throw error
    }
  })()
  const requestState: MetricDefinitionsRequest = {
    generation: requestGeneration,
    promise: request,
  }
  metricDefinitionsRequest = requestState

  try {
    try {
      const definitions = await request
      if (requestGeneration !== metricCompatibilityGeneration) {
        if (metricDefinitionsRequest === requestState) {
          metricDefinitionsRequest = null
        }
        return getMetricDefinitions()
      }
      return definitions
    }
    catch (error) {
      if (requestGeneration !== metricCompatibilityGeneration) {
        if (metricDefinitionsRequest === requestState) {
          metricDefinitionsRequest = null
        }
        return getMetricDefinitions()
      }
      throw error
    }
  }
  finally {
    if (metricDefinitionsRequest === requestState) {
      metricDefinitionsRequest = null
    }
  }
}

export function resetMetricCompatibilityCache(): void {
  metricCompatibilityGeneration++
  metricDefinitionsSupported = null
  metricQuerySupported = null
  pingMetricStatsSupported = null
  metricDefinitions = null
  metricDefinitionsRequest = null
  metricDefinitionsLoadedAt = 0
}

export function getAvailableMetricKeys(definitions: MetricDefinition[], desiredKeys: readonly string[]): string[] {
  const available = new Set(definitions.map(definition => definition.name))
  return desiredKeys.filter(key => available.has(key))
}

export function getEnabledMetricKeys(definitions: MetricDefinition[], desiredKeys: readonly string[]): string[] {
  const enabled = new Set(
    definitions
      .filter(definition => definition.retention_days > 0)
      .map(definition => definition.name),
  )
  return desiredKeys.filter(key => enabled.has(key))
}

/**
 * 计算统一视图中所有已启用相关指标都完整可用的保留窗口。
 * 零 retention 的指标不参与窗口计算，它们应在历史模式中保持为空；
 * 若没有任何启用的相关指标则返回 0。
 */
export function getMetricRetentionHours(definitions: MetricDefinition[], metricKeys: readonly string[]): number {
  const wanted = new Set(metricKeys)
  const retentionDays: number[] = []
  for (const definition of definitions) {
    if (!wanted.has(definition.name))
      continue
    if (Number.isFinite(definition.retention_days) && definition.retention_days > 0) {
      retentionDays.push(definition.retention_days)
    }
  }
  if (retentionDays.length === 0)
    return 0
  return Math.min(...retentionDays) * 24
}

export async function queryMetricsIfSupported(params: MetricQueryParams): Promise<MetricQueryResponse | null> {
  if (metricDefinitionsSupported === null || !isMetricCompatibilityCacheFresh()) {
    await getMetricDefinitions()
  }
  if (metricDefinitionsSupported === false || metricQuerySupported === false) {
    return null
  }

  const requestGeneration = metricCompatibilityGeneration
  try {
    const response = await getSharedRpc().queryMetrics(params)
    if (requestGeneration !== metricCompatibilityGeneration) {
      return queryMetricsIfSupported(params)
    }
    metricQuerySupported = true
    return response
  }
  catch (error) {
    if (requestGeneration !== metricCompatibilityGeneration) {
      return queryMetricsIfSupported(params)
    }
    if (isRpcMethodUnavailable(error)) {
      metricQuerySupported = false
      return null
    }
    throw error
  }
}

export async function getPingMetricStatsIfSupported(params: PingMetricStatsParams): Promise<PingMetricStatsResponse | null> {
  if (metricDefinitionsSupported === null || !isMetricCompatibilityCacheFresh()) {
    await getMetricDefinitions()
  }
  if (metricDefinitionsSupported === false || pingMetricStatsSupported === false) {
    return null
  }

  const requestGeneration = metricCompatibilityGeneration
  try {
    const response = await getSharedRpc().getPingMetricStats(params)
    if (requestGeneration !== metricCompatibilityGeneration) {
      return getPingMetricStatsIfSupported(params)
    }
    pingMetricStatsSupported = true
    return response
  }
  catch (error) {
    if (requestGeneration !== metricCompatibilityGeneration) {
      return getPingMetricStatsIfSupported(params)
    }
    if (isRpcMethodUnavailable(error)) {
      pingMetricStatsSupported = false
      return null
    }
    throw error
  }
}

const LOAD_METRIC_FIELD_MAP: Record<string, keyof RecordFormat> = {
  [METRIC_KEYS.cpu]: 'cpu',
  [METRIC_KEYS.gpu]: 'gpu',
  [METRIC_KEYS.ram]: 'ram',
  [METRIC_KEYS.ramTotal]: 'ram_total',
  [METRIC_KEYS.swap]: 'swap',
  [METRIC_KEYS.swapTotal]: 'swap_total',
  [METRIC_KEYS.load]: 'load',
  [METRIC_KEYS.temperature]: 'temp',
  [METRIC_KEYS.disk]: 'disk',
  [METRIC_KEYS.diskTotal]: 'disk_total',
  [METRIC_KEYS.netIn]: 'net_in',
  [METRIC_KEYS.netOut]: 'net_out',
  [METRIC_KEYS.netTotalUp]: 'net_total_up',
  [METRIC_KEYS.netTotalDown]: 'net_total_down',
  [METRIC_KEYS.process]: 'process',
  [METRIC_KEYS.connectionsTcp]: 'connections',
  [METRIC_KEYS.connectionsUdp]: 'connections_udp',
}

function createEmptyRecord(client: string, time: string): RecordFormat {
  return {
    client,
    time,
    cpu: null,
    gpu: null,
    gpu_usage: null,
    gpu_memory: null,
    ram: null,
    ram_total: null,
    swap: null,
    swap_total: null,
    load: null,
    temp: null,
    disk: null,
    disk_total: null,
    net_in: null,
    net_out: null,
    net_total_up: null,
    net_total_down: null,
    process: null,
    connections: null,
    connections_udp: null,
  }
}

/** 合并 queryMetrics 返回的多条 series，不再进行客户端二次降采样。 */
export function mergeLoadMetricSeries(response: MetricQueryResponse, fallbackClient: string): RecordFormat[] {
  const records = new Map<string, RecordFormat>()

  for (const series of response.series) {
    const field = LOAD_METRIC_FIELD_MAP[series.metric_key]
    if (!field)
      continue
    const client = series.entity_id || fallbackClient
    for (const point of series.points) {
      const key = `${client}\u0000${point.time}`
      let record = records.get(key)
      if (!record) {
        record = createEmptyRecord(client, point.time)
        records.set(key, record)
      }
      if (field !== 'client' && field !== 'time' && field !== 'gpu_detailed') {
        record[field] = point.value
      }
    }
  }

  return Array.from(records.values()).sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}

export function metricSeriesTags(series: MetricSeries): Record<string, string> {
  return series.tags ?? series.tag ?? {}
}
