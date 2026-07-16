import type { NodeData } from '@/stores/nodes'

const DAY_MS = 24 * 60 * 60 * 1000
const AVERAGE_YEAR_DAYS = 365.2425
const DUE_SOON_DAYS = 30
const MAX_EXPIRED_ITEMS = 4
const MAX_UPCOMING_ITEMS = 8

interface CurrencyInfo {
  key: string
  code: string
  symbol: string
  label: string
  isMissing: boolean
}

interface CycleInfo {
  days: number
  annualMultiplier: number
  label: string
  shortLabel: string
}

interface ExpiryInfo {
  daysLeft: number
  expiredLessThanDay: boolean
  isExpired: boolean
  isLongTerm: boolean
  ms: number
}

export interface CurrencyRenewalSummary {
  currencyKey: string
  currencyCode: string
  currencySymbol: string
  label: string
  recurringCount: number
  activeCount: number
  configuredMonthly: number
  configuredAnnual: number
  activeMonthly: number
  activeAnnual: number
  unknownExpiryMonthly: number
  unknownExpiryCount: number
  expiredMonthly: number
  dueWithin30Amount: number
  dueWithin30Count: number
  overdueRenewalAmount: number
  overdueCount: number
}

export interface RenewalItem {
  uuid: string
  name: string
  price: number
  monthlyEquivalent: number
  currencyCode: string
  currencySymbol: string
  cycleLabel: string
  cycleShortLabel: string
  daysLeft: number
  expiredLessThanDay: boolean
  expiresAtMs: number
  autoRenewal: boolean
  isExpired: boolean
}

export interface RenewalStats {
  recurringCount: number
  activeRecurringCount: number
  oneTimeCount: number
  freeCount: number
  unpricedCount: number
  expiredCount: number
  dueSoonCount: number
  missingExpiryCount: number
  invalidExpiryCount: number
  invalidPricingCount: number
  missingCurrencyCount: number
  longTermCount: number
  autoRenewalCount: number
  manualRenewalCount: number
  expiredItems: RenewalItem[]
  expiredItemCount: number
  upcomingItems: RenewalItem[]
  upcomingItemCount: number
  currencySummaries: CurrencyRenewalSummary[]
  hasRecurringCosts: boolean
  hasBudgetData: boolean
}

const CODE_TO_SYMBOL: Record<string, string> = {
  AED: 'د.إ',
  AUD: 'A$',
  BRL: 'R$',
  CAD: 'C$',
  CHF: 'CHF',
  CNY: '¥',
  EUR: '€',
  GBP: '£',
  HKD: 'HK$',
  IDR: 'Rp',
  INR: '₹',
  JPY: '¥',
  KRW: '₩',
  MYR: 'RM',
  NZD: 'NZ$',
  PHP: '₱',
  RUB: '₽',
  SGD: 'S$',
  THB: '฿',
  TRY: '₺',
  TWD: 'NT$',
  USD: '$',
  VND: '₫',
}

const CODE_TO_LABEL: Record<string, string> = {
  AED: '阿联酋迪拉姆',
  ARS: '阿根廷比索',
  AUD: '澳元',
  BRL: '巴西雷亚尔',
  CAD: '加元',
  CHF: '瑞士法郎',
  CNY: '人民币',
  EUR: '欧元',
  GBP: '英镑',
  HKD: '港币',
  IDR: '印尼盾',
  INR: '印度卢比',
  JPY: '日元',
  KRW: '韩元',
  MXN: '墨西哥比索',
  MYR: '马来西亚令吉',
  NZD: '新西兰元',
  PHP: '菲律宾比索',
  RUB: '俄罗斯卢布',
  SGD: '新加坡元',
  THB: '泰铢',
  TRY: '土耳其里拉',
  TWD: '新台币',
  USD: '美元',
  VND: '越南盾',
}

const CYCLE_RANGES: Array<{
  min: number
  max: number
  months: number
  label: string
  shortLabel: string
}> = [
  { min: 27, max: 32, months: 1, label: '月付', shortLabel: '月' },
  { min: 87, max: 95, months: 3, label: '季付', shortLabel: '季' },
  { min: 175, max: 185, months: 6, label: '半年付', shortLabel: '半年' },
  { min: 360, max: 370, months: 12, label: '年付', shortLabel: '年' },
  { min: 720, max: 750, months: 24, label: '两年付', shortLabel: '2年' },
  { min: 1080, max: 1150, months: 36, label: '三年付', shortLabel: '3年' },
  { min: 1800, max: 1850, months: 60, label: '五年付', shortLabel: '5年' },
]

function normalizeCurrency(currency: string | undefined): CurrencyInfo {
  const raw = currency?.trim() ?? ''
  const upper = raw.toUpperCase()

  if (!raw) {
    return {
      key: 'MISSING',
      code: 'UNKNOWN',
      symbol: '',
      label: '未设置币种',
      isMissing: true,
    }
  }

  // Komari 官方表单约定美元、人民币符号；其他自由文本按规范化后的原值分组。
  const komariCode = raw === '$' || raw === '＄'
    ? 'USD'
    : raw === '¥' || raw === '￥'
      ? 'CNY'
      : upper

  if (/^[A-Z]{3}$/.test(komariCode)) {
    return {
      key: `ISO:${komariCode}`,
      code: komariCode,
      symbol: CODE_TO_SYMBOL[komariCode] ?? '',
      label: CODE_TO_LABEL[komariCode] ?? '三字母币种代码',
      isMissing: false,
    }
  }

  const isTextCode = /^[A-Z0-9][\w.-]*$/i.test(raw)
  return {
    key: `RAW:${isTextCode ? upper : raw}`,
    code: upper || raw,
    symbol: isTextCode ? '' : raw,
    label: '自定义币种标记',
    isMissing: false,
  }
}

function parseCycle(billingCycle: number): CycleInfo | null {
  if (!Number.isFinite(billingCycle) || billingCycle <= 0)
    return null

  for (const range of CYCLE_RANGES) {
    if (billingCycle >= range.min && billingCycle <= range.max) {
      return {
        days: billingCycle,
        annualMultiplier: 12 / range.months,
        label: range.label,
        shortLabel: range.shortLabel,
      }
    }
  }

  return {
    days: billingCycle,
    annualMultiplier: AVERAGE_YEAR_DAYS / billingCycle,
    label: `${billingCycle} 天周期`,
    shortLabel: `${billingCycle}天`,
  }
}

function localCalendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
}

function parseExpiry(expiredAt: string | null | undefined, now: Date): ExpiryInfo | null | undefined {
  const raw = expiredAt?.trim()
  if (!raw)
    return undefined

  const date = new Date(raw)
  const ms = date.getTime()
  if (!Number.isFinite(ms))
    return null
  if (date.getFullYear() < 2)
    return undefined

  const nowMs = now.getTime()
  const isExpired = ms <= nowMs
  const elapsedMs = Math.max(0, nowMs - ms)
  const expiredLessThanDay = isExpired && elapsedMs < DAY_MS
  const daysLeft = isExpired
    ? -Math.max(1, Math.floor(elapsedMs / DAY_MS))
    : Math.max(0, localCalendarDayNumber(date) - localCalendarDayNumber(now))
  const longTermThreshold = new Date(now)
  longTermThreshold.setFullYear(longTermThreshold.getFullYear() + 100)

  return {
    daysLeft,
    expiredLessThanDay,
    isExpired,
    isLongTerm: ms > longTermThreshold.getTime(),
    ms,
  }
}

function getOrCreateCurrencySummary(
  map: Map<string, CurrencyRenewalSummary>,
  currency: CurrencyInfo,
): CurrencyRenewalSummary {
  const current = map.get(currency.key)
  if (current)
    return current

  const summary: CurrencyRenewalSummary = {
    currencyKey: currency.key,
    currencyCode: currency.code,
    currencySymbol: currency.symbol,
    label: currency.label,
    recurringCount: 0,
    activeCount: 0,
    configuredMonthly: 0,
    configuredAnnual: 0,
    activeMonthly: 0,
    activeAnnual: 0,
    unknownExpiryMonthly: 0,
    unknownExpiryCount: 0,
    expiredMonthly: 0,
    dueWithin30Amount: 0,
    dueWithin30Count: 0,
    overdueRenewalAmount: 0,
    overdueCount: 0,
  }
  map.set(currency.key, summary)
  return summary
}

function createRenewalItem(
  node: NodeData,
  price: number,
  monthlyEquivalent: number,
  currency: CurrencyInfo,
  cycle: CycleInfo,
  expiry: ExpiryInfo,
): RenewalItem {
  return {
    uuid: node.uuid,
    name: node.name,
    price,
    monthlyEquivalent,
    currencyCode: currency.code,
    currencySymbol: currency.symbol,
    cycleLabel: cycle.label,
    cycleShortLabel: cycle.shortLabel,
    daysLeft: expiry.daysLeft,
    expiredLessThanDay: expiry.expiredLessThanDay,
    expiresAtMs: expiry.ms,
    autoRenewal: node.auto_renewal,
    isExpired: expiry.isExpired,
  }
}

function sortCurrencySummaries(summaries: CurrencyRenewalSummary[]): CurrencyRenewalSummary[] {
  return [...summaries].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
}

export function buildRenewalStats(nodes: NodeData[], now: Date = new Date()): RenewalStats {
  const currencySummaryMap = new Map<string, CurrencyRenewalSummary>()
  const expiredItems: RenewalItem[] = []
  const upcomingItems: RenewalItem[] = []

  let recurringCount = 0
  let activeRecurringCount = 0
  let oneTimeCount = 0
  let freeCount = 0
  let unpricedCount = 0
  let expiredCount = 0
  let dueSoonCount = 0
  let missingExpiryCount = 0
  let invalidExpiryCount = 0
  let invalidPricingCount = 0
  let missingCurrencyCount = 0
  let longTermCount = 0
  let autoRenewalCount = 0
  let manualRenewalCount = 0

  for (const node of nodes) {
    const price = Number(node.price)
    if (!Number.isFinite(price)) {
      invalidPricingCount += 1
      continue
    }

    if (price === -1) {
      freeCount += 1
      continue
    }

    if (price === 0) {
      unpricedCount += 1
      continue
    }

    if (price < 0) {
      invalidPricingCount += 1
      continue
    }

    if (node.billing_cycle === -1) {
      oneTimeCount += 1
      continue
    }

    const cycle = parseCycle(Number(node.billing_cycle))
    if (!cycle) {
      invalidPricingCount += 1
      continue
    }

    const monthlyEquivalent = price * cycle.annualMultiplier / 12
    const annualEquivalent = price * cycle.annualMultiplier
    if (!Number.isFinite(monthlyEquivalent) || !Number.isFinite(annualEquivalent)) {
      invalidPricingCount += 1
      continue
    }

    recurringCount += 1
    if (node.auto_renewal)
      autoRenewalCount += 1
    else
      manualRenewalCount += 1

    const currency = normalizeCurrency(node.currency)
    const summary = currency.isMissing
      ? null
      : getOrCreateCurrencySummary(currencySummaryMap, currency)

    if (currency.isMissing) {
      missingCurrencyCount += 1
    }
    else if (summary) {
      summary.recurringCount += 1
      summary.configuredMonthly += monthlyEquivalent
      summary.configuredAnnual += annualEquivalent
    }

    const expiry = parseExpiry(node.expired_at, now)
    if (expiry === undefined) {
      missingExpiryCount += 1
      if (summary) {
        summary.unknownExpiryMonthly += monthlyEquivalent
        summary.unknownExpiryCount += 1
      }
      continue
    }
    if (expiry === null) {
      invalidExpiryCount += 1
      if (summary) {
        summary.unknownExpiryMonthly += monthlyEquivalent
        summary.unknownExpiryCount += 1
      }
      continue
    }

    const item = createRenewalItem(node, price, monthlyEquivalent, currency, cycle, expiry)
    if (expiry.isExpired) {
      expiredCount += 1
      expiredItems.push(item)
      if (summary) {
        summary.expiredMonthly += monthlyEquivalent
        summary.overdueRenewalAmount += price
        summary.overdueCount += 1
      }
      continue
    }

    activeRecurringCount += 1
    if (summary) {
      summary.activeCount += 1
      summary.activeMonthly += monthlyEquivalent
      summary.activeAnnual += annualEquivalent
    }

    if (expiry.isLongTerm) {
      longTermCount += 1
      continue
    }

    upcomingItems.push(item)
    if (expiry.daysLeft <= DUE_SOON_DAYS) {
      dueSoonCount += 1
      if (summary) {
        summary.dueWithin30Amount += price
        summary.dueWithin30Count += 1
      }
    }
  }

  expiredItems.sort((a, b) => b.expiresAtMs - a.expiresAtMs)
  upcomingItems.sort((a, b) => a.expiresAtMs - b.expiresAtMs)

  const currencySummaries = sortCurrencySummaries(Array.from(currencySummaryMap.values()))
  return {
    recurringCount,
    activeRecurringCount,
    oneTimeCount,
    freeCount,
    unpricedCount,
    expiredCount,
    dueSoonCount,
    missingExpiryCount,
    invalidExpiryCount,
    invalidPricingCount,
    missingCurrencyCount,
    longTermCount,
    autoRenewalCount,
    manualRenewalCount,
    expiredItems: expiredItems.slice(0, MAX_EXPIRED_ITEMS),
    expiredItemCount: expiredItems.length,
    upcomingItems: upcomingItems.slice(0, MAX_UPCOMING_ITEMS),
    upcomingItemCount: upcomingItems.length,
    currencySummaries,
    hasRecurringCosts: recurringCount > 0,
    hasBudgetData: currencySummaries.length > 0,
  }
}

export function formatMoney(
  amount: number,
  currencyCode: string,
  currencySymbol: string,
  includeCode = false,
): string {
  if (!Number.isFinite(amount))
    return '—'

  const shouldUseInteger = Math.abs(amount - Math.round(amount)) < 0.005
  const formatted = amount.toLocaleString('zh-CN', {
    maximumFractionDigits: shouldUseInteger ? 0 : 2,
    minimumFractionDigits: 0,
  })

  if (currencyCode === 'UNKNOWN')
    return `${formatted}（未设置币种）`

  const amountText = currencySymbol
    ? `${currencySymbol}${formatted}`
    : `${currencyCode} ${formatted}`
  if (includeCode && currencySymbol && currencySymbol !== currencyCode)
    return `${currencyCode} ${amountText}`
  return amountText
}

export function formatRenewalDate(ms: number): string {
  const date = new Date(ms)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatRenewalDays(daysLeft: number, expiredLessThanDay = false): string {
  if (daysLeft < 0) {
    if (expiredLessThanDay)
      return '已过期（不足 1 天）'
    return `已过期 ${Math.abs(daysLeft)} 天`
  }
  if (daysLeft === 0)
    return '今天到期'
  if (daysLeft === 1)
    return '明天到期'
  return `${daysLeft} 天后`
}

export function getRenewalUrgencyType(daysLeft: number): 'default' | 'error' | 'warning' {
  if (daysLeft < 0 || daysLeft <= 7)
    return 'error'
  if (daysLeft <= DUE_SOON_DAYS)
    return 'warning'
  return 'default'
}
