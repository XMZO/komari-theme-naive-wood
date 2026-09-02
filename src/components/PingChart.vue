<script setup lang="ts">
import type { MetricDefinition, MetricQueryResponse, PingMetricTaskStats, PublicPingTask } from '@/utils/rpc'
import { useIntervalFn } from '@vueuse/core'
import dayjs from 'dayjs'
import { NButton, NEmpty, NSpin, NSwitch, NTooltip } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import LiquidGlassSurface from '@/components/LiquidGlassSurface.vue'
import { useAppStore } from '@/stores/app'
import {
  getMetricDefinitions,
  getMetricQueryMaxPoints,
  getPingMetricStatsIfSupported,
  METRIC_KEYS,
  metricSeriesTags,
  PING_HISTORY_METRIC_KEYS,
  queryMetricsIfSupported,
} from '@/utils/metrics'
import { cutPeakValues, interpolateNullsLinear } from '@/utils/recordHelper'
import { getSharedRpc, isRpcMethodUnavailable } from '@/utils/rpc'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
// 使用共享的 RPC 实例，避免重复创建连接
const rpc = getSharedRpc()
const PING_HISTORY_REFRESH_INTERVAL_MS = 60_000

// 图表主题相关颜色
const chartThemeColors = computed(() => ({
  text: isDark.value ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
  textSecondary: isDark.value ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
  textTertiary: isDark.value ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
  borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  tooltipBg: isDark.value ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.98)',
  tooltipShadow: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.12)',
  crosshairColor: isDark.value ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
}))

// 优化后的图表配色方案（多任务时使用）
const chartColors = [
  '#FF6B6B', // 珊瑚红
  '#4ECDC4', // 青绿色
  '#A78BFA', // 紫罗兰
  '#60A5FA', // 天蓝色
  '#FFB347', // 琥珀黄
  '#F472B6', // 粉红色
  '#34D399', // 翠绿色
  '#FB923C', // 橙色
]

const metricRetentionHours = ref<number | null>(null)

// 旧版本没有逐指标定义时才使用兼容字段。0 是合法的“关闭历史记录”，不能用 || 覆盖。
const legacyPingRetentionHours = computed(() => {
  const value = appStore.publicSettings?.ping_record_preserve_time
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 168
})

const maxPingRecordPreserveTime = computed(() => metricRetentionHours.value ?? legacyPingRetentionHours.value)

// 视图选项
const presetViews = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '12 小时', hours: 12 },
  { label: '1 天', hours: 24 },
]

// 可用视图列表
const availableViews = computed(() => {
  const views: { label: string, hours: number }[] = []
  const maxHours = maxPingRecordPreserveTime.value

  for (const v of presetViews) {
    if (maxHours >= v.hours) {
      views.push(v)
    }
  }

  const maxPreset = presetViews[presetViews.length - 1]
  if (maxPreset && maxHours > maxPreset.hours) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }
  else if (maxHours > 1 && !presetViews.some(v => v.hours === maxHours)) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }

  return views
})

// 当前选中的视图
const selectedView = ref<string>('')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours ?? 0
})

// 初始化默认视图
watch(availableViews, (views) => {
  if (!views.some(view => view.label === selectedView.value)) {
    selectedView.value = views[0]?.label ?? ''
  }
}, { immediate: true })

// ==================== 类型定义 ====================

interface LegacyPingRecord {
  client: string
  task_id: number
  time: string
  value: number
}

interface TaskInfo {
  id: string
  name: string
  interval?: number | null
  loss: number | null
  lossApproximate?: boolean
  p99?: number | null
  p50?: number | null
  p99_p50_ratio?: number | null
  min?: number | null
  max?: number | null
  avg?: number | null
  latest?: number | null
  stddev?: number | null
  total?: number | null
  valid?: number | null
  type?: string
}

interface LegacyTaskInfo {
  id: number
  name: string
  interval?: number
  loss?: number
  p99?: number | null
  p50?: number | null
  p99_p50_ratio?: number | null
  min?: number | null
  max?: number | null
  avg?: number | null
  latest?: number | null
  total?: number | null
  type?: string
}

interface LegacyPingRecordsResponse {
  count: number
  records: LegacyPingRecord[]
  tasks?: LegacyTaskInfo[]
  from?: string
  to?: string
}

type PingChartRow = { time: string } & Record<string, string | number | null>

interface PingDataPayload {
  rows: PingChartRow[]
  tasks: TaskInfo[]
  retentionHours: number | null
  queryIntervalSeconds: number | null
}

// 数据状态
const pingRows = shallowRef<PingChartRow[]>([])
const tasks = shallowRef<TaskInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const metricQueryIntervalSeconds = ref<number | null>(null)

// 任务选择
const selectedTaskIds = ref<string[]>([])
const cutPeak = ref(false)
let selectionTouched = false

const chartMargin = { top: 12, right: 24, bottom: 52, left: 56 }
let fetchSequence = 0
let backgroundRefreshInFlight = false

// ==================== 数据获取 ====================

function minimumPositivePingRetentionHours(definitions: MetricDefinition[]): number {
  const definitionMap = new Map(definitions.map(definition => [definition.name, definition]))
  const latencyDays = definitionMap.get(METRIC_KEYS.pingLatency)?.retention_days
  if (typeof latencyDays !== 'number' || !Number.isFinite(latencyDays) || latencyDays <= 0)
    return 0

  const lossDays = definitionMap.get(METRIC_KEYS.pingLoss)?.retention_days
  const positiveDays = [latencyDays]
  if (typeof lossDays === 'number' && Number.isFinite(lossDays) && lossDays > 0) {
    positiveDays.push(lossDays)
  }

  return Math.min(...positiveDays) * 24
}

function activePingMetricKeys(definitions: MetricDefinition[]): string[] {
  const definitionMap = new Map(definitions.map(definition => [definition.name, definition]))
  return PING_HISTORY_METRIC_KEYS.filter((key) => {
    const days = definitionMap.get(key)?.retention_days
    return typeof days === 'number' && Number.isFinite(days) && days > 0
  })
}

function nullableFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function metricStatToTask(stat: PingMetricTaskStats): TaskInfo {
  const id = String(stat.task_id)
  return {
    id,
    name: stat.name || `任务 ${id}`,
    interval: nullableFiniteNumber(stat.interval),
    loss: Number.isFinite(stat.loss) ? stat.loss : null,
    lossApproximate: stat.loss_approximate === true,
    min: nullableFiniteNumber(stat.min),
    max: nullableFiniteNumber(stat.max),
    avg: nullableFiniteNumber(stat.avg),
    latest: nullableFiniteNumber(stat.latest),
    p50: nullableFiniteNumber(stat.p50),
    p99: nullableFiniteNumber(stat.p99),
    stddev: nullableFiniteNumber(stat.stddev),
    p99_p50_ratio: nullableFiniteNumber(stat.p99_p50_ratio),
    total: Number.isFinite(stat.total) ? stat.total : null,
    valid: Number.isFinite(stat.valid) ? stat.valid : null,
    type: stat.type,
  }
}

function legacyTaskToTask(task: LegacyTaskInfo): TaskInfo {
  const id = String(task.id)
  return {
    id,
    name: task.name || `任务 ${id}`,
    interval: nullableFiniteNumber(task.interval),
    loss: typeof task.loss === 'number' && Number.isFinite(task.loss) ? task.loss : null,
    min: nullableFiniteNumber(task.min),
    max: nullableFiniteNumber(task.max),
    avg: nullableFiniteNumber(task.avg),
    latest: nullableFiniteNumber(task.latest),
    p50: nullableFiniteNumber(task.p50),
    p99: nullableFiniteNumber(task.p99),
    p99_p50_ratio: nullableFiniteNumber(task.p99_p50_ratio),
    total: nullableFiniteNumber(task.total),
    type: task.type,
  }
}

function correctLatencyAverage(latency: number | null | undefined, loss: number | null | undefined): number | null {
  if (typeof latency !== 'number' || !Number.isFinite(latency))
    return null

  if (typeof loss !== 'number' || !Number.isFinite(loss))
    return latency >= 0 ? latency : null

  const normalizedLoss = Math.min(1, Math.max(0, loss))
  if (normalizedLoss >= 1)
    return null

  // ping.latency_ms 以 -1 表示丢包；结合同时写入的 ping.loss 恢复成功样本平均值。
  const corrected = (latency + normalizedLoss) / (1 - normalizedLoss)
  return Number.isFinite(corrected) && corrected >= 0 ? corrected : null
}

function buildMetricPayload(
  query: MetricQueryResponse,
  stats: PingMetricTaskStats[],
  publicTasks: PublicPingTask[] | null,
  retentionHours: number,
  uuid: string,
): PingDataPayload {
  interface MetricBucket {
    taskID: string
    time: string
    latency?: number | null
    loss?: number | null
  }

  const buckets = new Map<string, MetricBucket>()
  const taskIDs = new Set<string>()
  const lossTotals = new Map<string, { weightedLoss: number, count: number }>()

  for (const series of query.series) {
    if (series.metric_key !== METRIC_KEYS.pingLatency && series.metric_key !== METRIC_KEYS.pingLoss)
      continue
    const taskID = metricSeriesTags(series).task_id
    if (!taskID)
      continue
    taskIDs.add(taskID)

    for (const point of series.points) {
      const key = `${taskID}\u0000${point.time}`
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { taskID, time: point.time }
        buckets.set(key, bucket)
      }

      if (series.metric_key === METRIC_KEYS.pingLatency) {
        bucket.latency = point.value
      }
      else {
        bucket.loss = point.value
        if (typeof point.value === 'number' && Number.isFinite(point.value)) {
          const sampleCount = typeof point.count === 'number' && point.count > 0 ? point.count : 1
          const total = lossTotals.get(taskID) ?? { weightedLoss: 0, count: 0 }
          total.weightedLoss += Math.min(1, Math.max(0, point.value)) * sampleCount
          total.count += sampleCount
          lossTotals.set(taskID, total)
        }
      }
    }
  }

  const rowMap = new Map<string, PingChartRow>()
  for (const bucket of buckets.values()) {
    let row = rowMap.get(bucket.time)
    if (!row) {
      row = { time: bucket.time }
      rowMap.set(bucket.time, row)
    }
    row[bucket.taskID] = correctLatencyAverage(bucket.latency, bucket.loss)
  }

  const statsTaskIDs = stats.map(stat => String(stat.task_id))
  const taskMap = new Map(stats.map(stat => [String(stat.task_id), metricStatToTask(stat)]))
  statsTaskIDs.forEach(taskID => taskIDs.add(taskID))
  for (const taskID of taskIDs) {
    if (taskMap.has(taskID))
      continue
    const lossTotal = lossTotals.get(taskID)
    taskMap.set(taskID, {
      id: taskID,
      name: `任务 ${taskID}`,
      loss: lossTotal && lossTotal.count > 0 ? lossTotal.weightedLoss / lossTotal.count * 100 : null,
      lossApproximate: false,
    })
  }

  const orderedTasks: TaskInfo[] = []
  const addedTaskIDs = new Set<string>()
  const appendTask = (taskID: string, metadata?: PublicPingTask) => {
    if (addedTaskIDs.has(taskID))
      return
    const task: TaskInfo = taskMap.get(taskID) ?? {
      id: taskID,
      name: `任务 ${taskID}`,
      loss: null,
    }
    orderedTasks.push(metadata
      ? {
          ...task,
          name: metadata.name || task.name,
          interval: nullableFiniteNumber(metadata.interval) ?? task.interval,
          type: metadata.type || task.type,
        }
      : task)
    addedTaskIDs.add(taskID)
  }

  if (publicTasks !== null) {
    for (const task of publicTasks) {
      if (!Array.isArray(task.clients) || !task.clients.includes(uuid))
        continue
      appendTask(String(task.id), task)
    }
  }

  // 公开任务接口不可用时严格保留 stats 顺序；未出现在 stats 的序列随后按查询顺序追加。
  statsTaskIDs.forEach(taskID => appendTask(taskID))
  taskIDs.forEach(taskID => appendTask(taskID))

  return {
    rows: Array.from(rowMap.values()).sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf()),
    tasks: orderedTasks,
    retentionHours,
    queryIntervalSeconds: query.series.reduce<number | null>((smallest, series) => {
      const interval = series.interval_seconds
      if (typeof interval !== 'number' || !Number.isFinite(interval) || interval <= 0)
        return smallest
      return smallest === null ? interval : Math.min(smallest, interval)
    }, null),
  }
}

function buildLegacyPayload(result: LegacyPingRecordsResponse): PingDataPayload {
  const legacyTasks = (result.tasks ?? []).map(legacyTaskToTask)
  const taskIntervals = legacyTasks
    .map(task => task.interval)
    .filter((value): value is number => typeof value === 'number' && value > 0)
  const fallbackIntervalSec = taskIntervals.length > 0 ? Math.min(...taskIntervals) : 60
  const toleranceMs = Math.min(6000, Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)))
  const grouped = new Map<number, PingChartRow>()
  const anchors: number[] = []
  const taskIDs = new Set<string>(legacyTasks.map(task => task.id))

  const records = [...(result.records ?? [])].sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
  for (const record of records) {
    const taskID = String(record.task_id)
    taskIDs.add(taskID)
    const timestamp = dayjs(record.time).valueOf()
    let anchor = anchors.find(value => Math.abs(value - timestamp) <= toleranceMs)
    if (anchor === undefined) {
      anchor = timestamp
      anchors.push(anchor)
      grouped.set(anchor, { time: dayjs(anchor).toISOString() })
    }
    const row = grouped.get(anchor)!
    row[taskID] = record.value >= 0 ? record.value : null
  }

  const taskMap = new Map(legacyTasks.map(task => [task.id, task]))
  for (const taskID of taskIDs) {
    if (!taskMap.has(taskID)) {
      taskMap.set(taskID, { id: taskID, name: `任务 ${taskID}`, loss: null })
    }
  }

  return {
    rows: Array.from(grouped.values()).sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf()),
    tasks: Array.from(taskMap.values()),
    retentionHours: null,
    queryIntervalSeconds: null,
  }
}

async function fetchPublicPingTasksIfSupported(): Promise<PublicPingTask[] | null> {
  try {
    return await rpc.getPublicPingTasks()
  }
  catch (err) {
    if (isRpcMethodUnavailable(err))
      return null
    throw err
  }
}

async function fetchMetricPayload(uuid: string, hours: number): Promise<PingDataPayload | null> {
  const definitions = await getMetricDefinitions()
  if (definitions === null)
    return null

  const retentionHours = minimumPositivePingRetentionHours(definitions)
  const metricKeys = activePingMetricKeys(definitions)
  if (retentionHours === 0 || hours <= 0 || metricKeys.length === 0) {
    return { rows: [], tasks: [], retentionHours, queryIntervalSeconds: null }
  }

  const [statsResponse, publicTasks] = await Promise.all([
    getPingMetricStatsIfSupported({ entity_id: uuid, hours, max_points: 600 }),
    fetchPublicPingTasksIfSupported(),
  ])

  if (statsResponse === null)
    return null

  const statsIntervals = statsResponse.stats
    .map(stat => stat.interval)
    .filter((interval): interval is number => typeof interval === 'number' && Number.isFinite(interval) && interval > 0)
  const configuredIntervals = (publicTasks ?? [])
    .filter(task => Array.isArray(task.clients) && task.clients.includes(uuid))
    .map(task => task.interval)
    .filter(interval => Number.isFinite(interval) && interval > 0)
  const taskIntervals = statsIntervals.length > 0 ? statsIntervals : configuredIntervals
  // 混合周期时保留最快任务的连续曲线；较慢任务的真实孤立点由 symbol 展示。
  const sampleInterval = taskIntervals.length > 0 ? Math.min(...taskIntervals) : 60
  const query = await queryMetricsIfSupported({
    metric_keys: metricKeys,
    entity_id: uuid,
    hours,
    downsample: true,
    fill_empty: true,
    max_points: getMetricQueryMaxPoints(hours, sampleInterval),
    aggregation: 'avg',
    aggregation_by_metric: {
      [METRIC_KEYS.pingLatency]: 'avg',
      [METRIC_KEYS.pingLoss]: 'avg',
    },
  })

  if (query === null)
    return null

  return buildMetricPayload(query, statsResponse.stats, publicTasks, retentionHours, uuid)
}

async function fetchLegacyPayload(uuid: string, hours: number): Promise<PingDataPayload> {
  if (hours <= 0)
    return { rows: [], tasks: [], retentionHours: null, queryIntervalSeconds: null }

  const result = await rpc.getClient().call<LegacyPingRecordsResponse>('common:getRecords', {
    uuid,
    type: 'ping',
    hours,
  })
  return buildLegacyPayload(result)
}

function syncSelectedTasks(nextTasks: TaskInfo[]): void {
  const available = new Set(nextTasks.map(task => task.id))
  const selected = selectedTaskIds.value.filter(id => available.has(id))
  selectedTaskIds.value = selectionTouched ? selected : nextTasks.map(task => task.id)
}

async function fetchRecords(options: { background?: boolean } = {}): Promise<void> {
  const background = options.background === true
  const uuid = props.uuid
  if (!uuid)
    return
  if (background && (backgroundRefreshInFlight || loading.value))
    return

  if (background) {
    backgroundRefreshInFlight = true
  }

  const requestID = ++fetchSequence
  const hours = selectedHours.value
  const isRequestCurrent = () => requestID === fetchSequence
    && uuid === props.uuid
    && hours === selectedHours.value

  if (!background) {
    loading.value = true
    error.value = null
  }

  try {
    const metricPayload = await fetchMetricPayload(uuid, hours)
    const payload = metricPayload ?? await fetchLegacyPayload(uuid, hours)
    if (!isRequestCurrent())
      return

    error.value = null
    metricRetentionHours.value = payload.retentionHours
    metricQueryIntervalSeconds.value = payload.queryIntervalSeconds
    pingRows.value = payload.rows
    tasks.value = payload.tasks
    syncSelectedTasks(payload.tasks)
  }
  catch (err) {
    if (!isRequestCurrent())
      return
    if (background) {
      console.error('[PingChart] Background refresh failed:', err)
    }
    else {
      error.value = err instanceof Error ? err.message : '获取数据失败'
      metricQueryIntervalSeconds.value = null
      pingRows.value = []
      tasks.value = []
    }
  }
  finally {
    if (!background && requestID === fetchSequence) {
      loading.value = false
    }
    if (background) {
      backgroundRefreshInFlight = false
    }
  }
}

// ==================== 数据处理 ====================

function applyCutPeakWithoutFillingGaps(data: PingChartRow[], keys: string[]): PingChartRow[] {
  const output = data.map(row => ({ ...row }))

  for (const key of keys) {
    let index = 0
    while (index < output.length) {
      while (index < output.length && typeof output[index]?.[key] !== 'number')
        index++
      const start = index
      while (index < output.length && typeof output[index]?.[key] === 'number')
        index++
      if (start === index)
        continue

      const segment = output.slice(start, index).map(row => ({ ...row }))
      const smoothed = cutPeakValues(segment, [key])
      for (let offset = 0; offset < smoothed.length; offset++) {
        const row = output[start + offset]
        const value = smoothed[offset]?.[key]
        if (row && typeof value === 'number' && Number.isFinite(value)) {
          row[key] = value
        }
      }
    }
  }

  return output
}

const chartSourceData = computed(() => {
  const selectedKeys = selectedTaskIds.value

  if (selectedKeys.length === 0)
    return []

  return cutPeak.value
    ? applyCutPeakWithoutFillingGaps(pingRows.value, selectedKeys)
    : pingRows.value
})

const chartData = computed(() => {
  const selectedKeys = selectedTaskIds.value
  const sourceRows = chartSourceData.value

  if (selectedKeys.length === 0)
    return []

  if (metricRetentionHours.value === null) {
    // 旧 common:getRecords 以 null 表示失败探测，且各任务回报时间可能不完全对齐。
    return interpolateNullsLinear(sourceRows, selectedKeys, {
      maxGapMultiplier: 6,
      minCapMs: 2 * 60_000,
      maxCapMs: 30 * 60_000,
    }) as PingChartRow[]
  }

  const queryIntervalSeconds = metricQueryIntervalSeconds.value
  if (queryIntervalSeconds === null)
    return sourceRows

  // metrics 只连接一个孤立采样空洞。连续丢包、长时间缺报与首尾空洞仍保持断开。
  return interpolateNullsLinear(sourceRows, selectedKeys, {
    maxGapMs: queryIntervalSeconds * 2 * 1000,
    onlyExplicitNulls: true,
  }) as PingChartRow[]
})

function isInterpolatedPoint(taskID: string, dataIndex: number): boolean {
  const sourceValue = chartSourceData.value[dataIndex]?.[taskID]
  const chartValue = chartData.value[dataIndex]?.[taskID]
  return !(typeof sourceValue === 'number' && Number.isFinite(sourceValue))
    && typeof chartValue === 'number'
    && Number.isFinite(chartValue)
}

const emptyDescription = computed(() => maxPingRecordPreserveTime.value === 0
  ? 'Ping 历史记录已关闭'
  : '暂无延迟数据')

// ==================== 工具函数 ====================

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format('HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

const showDateInAxis = computed(() => selectedHours.value >= 24)

// ==================== 任务选择 ====================

// 获取任务颜色（根据任务在完整列表中的索引）
function getTaskColor(taskId: string): string {
  const taskIndex = tasks.value.findIndex(t => t.id === taskId)
  const safeIndex = Math.max(0, taskIndex % chartColors.length)
  return chartColors[safeIndex]!
}

// 最新值统计（从服务端 tasks 获取，保持颜色顺序）
const latestValues = computed(() => {
  if (!tasks.value.length)
    return []

  const latestMap = new Map<string, number | null>()
  for (const task of tasks.value) {
    const statLatest = nullableFiniteNumber(task.latest)
    if (statLatest !== null) {
      latestMap.set(task.id, statLatest)
      continue
    }

    for (let i = pingRows.value.length - 1; i >= 0; i--) {
      const value = pingRows.value[i]?.[task.id]
      if (typeof value === 'number' && Number.isFinite(value)) {
        latestMap.set(task.id, value)
        break
      }
    }
  }

  return tasks.value.map((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    return {
      ...task,
      latestValue: latestMap.get(task.id) ?? null,
      color: chartColors[safeIdx]!,
    }
  })
})

const selectedTasks = computed(() => {
  return tasks.value.filter(t => selectedTaskIds.value.includes(t.id))
})

// 切换任务选中状态
function toggleTask(taskId: string) {
  selectionTouched = true
  if (selectedTaskIds.value.includes(taskId)) {
    selectedTaskIds.value = selectedTaskIds.value.filter(id => id !== taskId)
  }
  else {
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  selectionTouched = true
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function hideAllTasks() {
  selectionTouched = true
  selectedTaskIds.value = []
}

// ==================== 图表配置 ====================

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: false,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 8,
  padding: [10, 14],
  boxShadow: `0 4px 16px ${chartThemeColors.value.tooltipShadow}`,
  textStyle: {
    color: chartThemeColors.value.text,
    fontSize: 13,
    lineHeight: 20,
  },
  extraCssText: 'box-shadow: none;',
  axisPointer: {
    type: 'cross' as const,
    crossStyle: {
      color: chartThemeColors.value.textTertiary,
    },
    lineStyle: {
      color: chartThemeColors.value.crosshairColor,
      width: 1,
      type: 'dashed' as const,
    },
    shadowStyle: {
      color: chartThemeColors.value.crosshairColor,
    },
  },
}))

const pingChartOption = computed(() => {
  const taskList = selectedTasks.value
  const data = chartData.value
  const hours = selectedHours.value

  // 构建 series，确保颜色与卡片一致
  const series = taskList.map((task) => {
    const color = getTaskColor(task.id)
    const seriesData = data.map(d => d[task.id] as number | null ?? null)
    const hasFiniteValue = seriesData.some(value => typeof value === 'number' && Number.isFinite(value))
    const hasLineSegment = seriesData.some((value, index) => {
      const nextValue = seriesData[index + 1]
      return typeof value === 'number'
        && Number.isFinite(value)
        && typeof nextValue === 'number'
        && Number.isFinite(nextValue)
    })
    return {
      name: task.name,
      type: 'line' as const,
      data: seriesData,
      smooth: cutPeak.value ? 0.6 : 0.4,
      showSymbol: hasFiniteValue && !hasLineSegment,
      symbolSize: 6,
      connectNulls: false,
      lineStyle: { width: 2.5, color, cap: 'round' as const },
      itemStyle: { color }, // 确保 symbol 颜色一致
    }
  })

  // 颜色映射表（用于 Tooltip）
  const colorMap = new Map<string, string>()
  tasks.value.forEach((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    colorMap.set(task.id, chartColors[safeIdx]!)
  })

  return {
    animation: false,
    // 全局颜色设置（用于图例等）
    color: tasks.value.map((_, idx) => {
      const safeIdx = Math.max(0, idx % chartColors.length)
      return chartColors[safeIdx]!
    }),
    tooltip: {
      ...baseTooltipConfig.value,
      formatter: (params: unknown) => {
        const p = params as Array<{ seriesName: string, value: number | null, dataIndex: number }>
        if (!p.length)
          return ''
        const firstParam = p[0]
        if (!firstParam)
          return ''
        const rowData = data[firstParam.dataIndex]
        if (!rowData)
          return ''

        const time = rowData.time as string
        const timeStr = formatTimeForTooltip(time, hours)
        let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
        html += '<div style="display:flex;flex-direction:column;gap:4px">'
        let hasInterpolatedValue = false

        // 按延迟值排序显示
        const sortedParams = [...p].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))

        for (const item of sortedParams) {
          if (item.value !== null && item.value !== undefined) {
            // 通过任务名找到对应的任务ID，再获取颜色
            const task = tasks.value.find(t => t.name === item.seriesName)
            const color = task ? colorMap.get(task.id) || chartColors[0] : chartColors[0]
            const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
            const interpolated = task ? isInterpolatedPoint(task.id, item.dataIndex) : false
            hasInterpolatedValue ||= interpolated
            const valuePrefix = interpolated ? '≈' : ''
            html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.seriesName}</span><span style="margin-left:auto;font-weight:600;margin-left:16px;font-variant-numeric:tabular-nums">${valuePrefix}${Math.round(item.value)} ms</span></div>`
          }
        }
        html += '</div>'
        if (hasInterpolatedValue) {
          html += `<div style="margin-top:6px;color:${chartThemeColors.value.textTertiary};font-size:11px">≈ 短时空洞估算值</div>`
        }
        return html
      },
    },
    legend: {
      type: 'scroll',
      bottom: 4,
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16,
      icon: 'roundRect',
      textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
      data: taskList.map(t => t.name),
    },
    grid: chartMargin,
    xAxis: {
      type: 'category',
      data: data.map(d => formatTime(d.time as string, showDateInAxis.value)),
      axisLabel: {
        fontSize: 11,
        color: chartThemeColors.value.textSecondary,
        margin: 12,
      },
      axisLine: {
        show: true,
        lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
      },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      name: '延迟 (ms)',
      nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
      axisLabel: { fontSize: 11, color: chartThemeColors.value.textSecondary, formatter: '{value}' },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: chartThemeColors.value.splitLineColor,
          type: 'dashed' as const,
        },
      },
    },
    series,
  }
})

// ==================== 生命周期 ====================

watch(selectedView, () => {
  selectionTouched = false
  selectedTaskIds.value = []
  void fetchRecords()
})

watch(() => props.uuid, () => {
  selectionTouched = false
  pingRows.value = []
  tasks.value = []
  selectedTaskIds.value = []
  void fetchRecords()
})

onMounted(() => {
  const firstView = availableViews.value[0]
  if (firstView && !selectedView.value) {
    selectedView.value = firstView.label
  }
  void fetchRecords()
})

onBeforeUnmount(() => {
  fetchSequence++
})

useIntervalFn(
  () => void fetchRecords({ background: true }),
  PING_HISTORY_REFRESH_INTERVAL_MS,
  { immediate: true, immediateCallback: false },
)

const hasLiquidGlass = computed(() => appStore.isLiquidGlassScopeEnabled('cards'))
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 时间选择器 -->
    <div v-if="availableViews.length > 0" class="flex flex-wrap gap-2 justify-center">
      <NButton
        v-for="view in availableViews"
        :key="view.label"
        :type="selectedView === view.label ? 'primary' : 'default'"
        size="small"
        @click="selectedView = view.label"
      >
        {{ view.label }}
      </NButton>
    </div>

    <!-- 内容区域 -->
    <NSpin :show="loading" content-class="flex flex-col gap-4">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="tasks.length === 0 && !loading" class="py-8">
        <NEmpty :description="emptyDescription" />
      </div>

      <template v-else>
        <!-- 最新值统计卡片（可点击切换选中状态） -->
        <div v-if="latestValues.length > 0" class="gap-3 grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))">
          <LiquidGlassSurface
            v-for="task in latestValues"
            :key="task.id"
            scope="cards"
            class="task-card-glass"
            :class="{ 'task-card-glass--enabled': hasLiquidGlass }"
          >
            <div
              class="p-3 border border-transparent flex gap-3 cursor-pointer select-none transition-colors items-center hover:border-solid"
              :class="[
                selectedTaskIds.includes(task.id)
                  ? ''
                  : 'opacity-50',
                appStore.cardMaterialActive ? appStore.cardMaterialClass : 'task-card-default',
                appStore.cardMaterialBlurClass,
              ]"
              :onmouseover="(e: MouseEvent) => ((e.currentTarget as HTMLElement).style.borderColor = task.color)"
              :onmouseout="(e: MouseEvent) => ((e.currentTarget as HTMLElement).style.borderColor = 'transparent')"
              @click="toggleTask(task.id)"
            >
              <div
                class="rounded-md flex-shrink-0 h-10 w-1.5"
                :style="{ backgroundColor: task.color }"
              />
              <div class="flex-1 min-w-0">
                <div class="flex gap-2 items-center">
                  <span class="text-base font-semibold truncate">{{ task.name }}</span>
                  <NTooltip placement="top">
                    <template #trigger>
                      <span class="i-carbon-information text-sm opacity-50 cursor-help transition-opacity hover:opacity-100" style="color: var(--n-text-color-2)" @click.stop />
                    </template>
                    <div class="text-sm gap-x-4 gap-y-1.5 grid grid-cols-2">
                      <template v-if="task.min != null">
                        <span style="color: var(--n-text-color-3)">最小</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.min) }} ms</span>
                      </template>
                      <template v-if="task.max != null">
                        <span style="color: var(--n-text-color-3)">最大</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.max) }} ms</span>
                      </template>
                      <template v-if="task.avg != null">
                        <span style="color: var(--n-text-color-3)">平均</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.avg) }} ms</span>
                      </template>
                      <template v-if="task.latest != null">
                        <span style="color: var(--n-text-color-3)">最新</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.latest) }} ms</span>
                      </template>
                      <template v-if="task.p50 != null">
                        <span style="color: var(--n-text-color-3)">P50</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.p50) }} ms</span>
                      </template>
                      <template v-if="task.p99 != null">
                        <span style="color: var(--n-text-color-3)">P99</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.p99) }} ms</span>
                      </template>
                      <template v-if="task.stddev != null">
                        <span style="color: var(--n-text-color-3)">标准差</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.stddev.toFixed(1) }} ms</span>
                      </template>
                      <template v-if="task.p99_p50_ratio != null">
                        <span style="color: var(--n-text-color-3)">波动率</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.p99_p50_ratio.toFixed(2) }}</span>
                      </template>
                      <template v-if="task.interval != null">
                        <span style="color: var(--n-text-color-3)">间隔</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.interval }}s</span>
                      </template>
                      <template v-if="task.type">
                        <span style="color: var(--n-text-color-3)">类型</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.type.toUpperCase() }}</span>
                      </template>
                      <template v-if="task.total != null">
                        <span style="color: var(--n-text-color-3)">总数</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.total }}</span>
                      </template>
                      <template v-if="task.valid != null">
                        <span style="color: var(--n-text-color-3)">有效</span>
                        <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.valid }}</span>
                      </template>
                      <template v-if="task.lossApproximate">
                        <span style="color: var(--n-text-color-3)">丢包统计</span>
                        <span class="font-medium">估算值</span>
                      </template>
                    </div>
                  </NTooltip>
                </div>
                <div class="text-sm mt-1 flex gap-3 items-center" style="color: var(--n-text-color-3)">
                  <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-1)' }">{{ task.latestValue !== null ? `${Math.round(task.latestValue)} ms` : '-' }}</span>
                  <span class="opacity-60">•</span>
                  <span
                    :style="{ fontFamily: appStore.numberFontFamily }"
                    :title="task.lossApproximate ? '丢包率由延迟指标近似推算' : undefined"
                  >{{ task.loss != null ? `${task.lossApproximate ? '≈' : ''}${task.loss.toFixed(1)}% 丢包${task.lossApproximate ? '（估算）' : ''}` : '丢包 -' }}</span>
                  <template v-if="task.p99_p50_ratio != null">
                    <span class="opacity-60">•</span>
                    <span :style="{ fontFamily: appStore.numberFontFamily }" title="波动率 p99/p50">{{ task.p99_p50_ratio.toFixed(1) }} 波动</span>
                  </template>
                </div>
              </div>
            </div>
          </LiquidGlassSurface>
        </div>

        <!-- 峰值裁剪开关 + 全选/全不选 -->
        <div class="flex flex-wrap gap-4 items-center">
          <div class="flex gap-2 items-center">
            <NSwitch v-model:value="cutPeak" size="small" />
            <span class="text-sm">裁剪峰值</span>
            <NTooltip>
              <template #trigger>
                <span class="i-carbon-information text-sm opacity-50 cursor-help transition-opacity hover:opacity-100" style="color: var(--n-text-color-3)" />
              </template>
              <span>使用 EWMA 算法平滑数据并过滤突变值</span>
            </NTooltip>
          </div>
          <div class="flex gap-2 items-center">
            <NButton size="small" tertiary @click="showAllTasks">
              全选
            </NButton>
            <NButton size="small" tertiary @click="hideAllTasks">
              全不选
            </NButton>
          </div>
        </div>

        <!-- 图表 -->
        <div class="h-80">
          <VChart :option="pingChartOption" autoresize />
        </div>
      </template>
    </NSpin>
  </div>
</template>

<style scoped>
/* 默认任务卡片样式 */
.task-card-glass {
  display: block;
}

.task-card-glass--enabled > :deep(.liquid-glass__content) > div {
  background-color: transparent !important;
  border-color: rgba(255, 255, 255, 0.38) !important;
}

html.dark .task-card-glass--enabled > :deep(.liquid-glass__content) > div {
  background-color: transparent !important;
  border-color: rgba(255, 255, 255, 0.18) !important;
}

.task-card-default {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: var(--n-border-radius);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

html.dark .task-card-default {
  background-color: rgba(30, 30, 35, 0.95);
  border-color: rgba(255, 255, 255, 0.08);
}
</style>
