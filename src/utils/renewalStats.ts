import type { NodeData } from '@/stores/nodes'

const DAY_MS = 24 * 60 * 60 * 1000
const LONG_TERM_DAYS = 36500
const CUSTOM_CYCLE_MONTH_DAYS = 30.4375

interface CurrencyInfo {
  code: string
  symbol: string
  label: string
}

interface CycleInfo {
  days: number
  months: number
  label: string
  shortLabel: string
}

interface ExpiryInfo {
  daysLeft: number
  isExpired: boolean
  isLongTerm: boolean
  ms: number
  remainingMs: number
}

interface MutableMoneyTotal {
  currency: CurrencyInfo
  amount: number
}

export interface MoneyTotal {
  currencyCode: string
  currencySymbol: string
  amount: number
}

export interface CurrencyRenewalSummary {
  currencyCode: string
  currencySymbol: string
  label: string
  monthly: number
  annual: number
  remaining: number
  recurringCount: number
}

export interface RenewalItem {
  uuid: string
  name: string
  price: number
  currencyCode: string
  currencySymbol: string
  cycleLabel: string
  cycleShortLabel: string
  daysLeft: number
  expiresAtMs: number
  autoRenewal: boolean
  isExpired: boolean
}

export interface RenewalStats {
  recurringCount: number
  oneTimeCount: number
  freeCount: number
  expiredCount: number
  dueSoonCount: number
  missingExpiryCount: number
  invalidCount: number
  longTermCount: number
  monthlyTotals: MoneyTotal[]
  annualTotals: MoneyTotal[]
  remainingTotals: MoneyTotal[]
  currencySummaries: CurrencyRenewalSummary[]
  upcoming: RenewalItem[]
  hasRecurringCosts: boolean
}

const KNOWN_CODES = new Set([
  'AED',
  'ARS',
  'AUD',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'EUR',
  'GBP',
  'HKD',
  'IDR',
  'INR',
  'JPY',
  'KRW',
  'MXN',
  'MYR',
  'NZD',
  'PHP',
  'RUB',
  'SGD',
  'THB',
  'TRY',
  'TWD',
  'USD',
  'VND',
])

const SYMBOL_TO_CODE: Record<string, string> = {
  '$': 'USD',
  'US$': 'USD',
  '¥': 'CNY',
  '￥': 'CNY',
  'CN¥': 'CNY',
  'RMB': 'CNY',
  '€': 'EUR',
  '£': 'GBP',
  '₩': 'KRW',
  '₽': 'RUB',
  '₹': 'INR',
  '₫': 'VND',
  '฿': 'THB',
  '₱': 'PHP',
  '₺': 'TRY',
  'HK$': 'HKD',
  'NT$': 'TWD',
  'S$': 'SGD',
  'A$': 'AUD',
  'C$': 'CAD',
  'NZ$': 'NZD',
  'R$': 'BRL',
  'JP¥': 'JPY',
  '円': 'JPY',
  'RM': 'MYR',
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

const INTEGER_CURRENCY_CODES = new Set(['IDR', 'JPY', 'KRW', 'VND'])

const CYCLE_RANGES: Array<{ min: number, max: number, months: number, label: string, shortLabel: string }> = [
  { min: 27, max: 32, months: 1, label: '月付', shortLabel: '月' },
  { min: 87, max: 95, months: 3, label: '季付', shortLabel: '季' },
  { min: 175, max: 186, months: 6, label: '半年付', shortLabel: '半年' },
  { min: 360, max: 370, months: 12, label: '年付', shortLabel: '年' },
  { min: 720, max: 750, months: 24, label: '两年付', shortLabel: '2年' },
  { min: 1080, max: 1150, months: 36, label: '三年付', shortLabel: '3年' },
  { min: 1800, max: 1850, months: 60, label: '五年付', shortLabel: '5年' },
]

function normalizeCurrency(currency: string | undefined): CurrencyInfo {
  const raw = currency?.trim() ?? ''
  const upper = raw.toUpperCase()

  if (KNOWN_CODES.has(upper)) {
    return {
      code: upper,
      symbol: CODE_TO_SYMBOL[upper] ?? upper,
      label: upper,
    }
  }

  const code = SYMBOL_TO_CODE[raw] ?? SYMBOL_TO_CODE[upper]
  if (code) {
    return {
      code,
      symbol: CODE_TO_SYMBOL[code] ?? raw,
      label: code,
    }
  }

  if (!raw) {
    return {
      code: 'UNKNOWN',
      symbol: '',
      label: '未知币种',
    }
  }

  return {
    code: upper || raw,
    symbol: raw,
    label: raw,
  }
}

function parseCycle(billingCycle: number): CycleInfo | null {
  if (!Number.isFinite(billingCycle) || billingCycle <= 0)
    return null

  for (const range of CYCLE_RANGES) {
    if (billingCycle >= range.min && billingCycle <= range.max) {
      return {
        days: billingCycle,
        months: range.months,
        label: range.label,
        shortLabel: range.shortLabel,
      }
    }
  }

  return {
    days: billingCycle,
    months: billingCycle / CUSTOM_CYCLE_MONTH_DAYS,
    label: `${billingCycle}天`,
    shortLabel: `${billingCycle}天`,
  }
}

function parseExpiry(expiredAt: string | undefined, nowMs: number): ExpiryInfo | null | undefined {
  const raw = expiredAt?.trim()
  if (!raw)
    return undefined

  const ms = new Date(raw).getTime()
  if (!Number.isFinite(ms))
    return null

  const remainingMs = ms - nowMs
  const daysLeft = Math.ceil(remainingMs / DAY_MS)

  return {
    daysLeft,
    isExpired: remainingMs <= 0,
    isLongTerm: daysLeft > LONG_TERM_DAYS,
    ms,
    remainingMs,
  }
}

function addMoney(map: Map<string, MutableMoneyTotal>, currency: CurrencyInfo, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0)
    return

  const current = map.get(currency.code)
  if (current) {
    current.amount += amount
    return
  }

  map.set(currency.code, { currency, amount })
}

function addCurrencySummary(
  map: Map<string, CurrencyRenewalSummary>,
  currency: CurrencyInfo,
  monthly: number,
  annual: number,
): void {
  const current = map.get(currency.code)
  if (current) {
    current.monthly += monthly
    current.annual += annual
    current.recurringCount += 1
    return
  }

  map.set(currency.code, {
    currencyCode: currency.code,
    currencySymbol: currency.symbol,
    label: currency.label,
    monthly,
    annual,
    remaining: 0,
    recurringCount: 1,
  })
}

function addRemainingToCurrencySummary(
  map: Map<string, CurrencyRenewalSummary>,
  currency: CurrencyInfo,
  remaining: number,
): void {
  const current = map.get(currency.code)
  if (current)
    current.remaining += remaining
}

function toMoneyTotals(map: Map<string, MutableMoneyTotal>): MoneyTotal[] {
  return Array.from(map.values())
    .map(total => ({
      amount: total.amount,
      currencyCode: total.currency.code,
      currencySymbol: total.currency.symbol,
    }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
}

function sortCurrencySummaries(summaries: CurrencyRenewalSummary[]): CurrencyRenewalSummary[] {
  return [...summaries].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
}

export function buildRenewalStats(nodes: NodeData[], now: Date = new Date()): RenewalStats {
  const nowMs = now.getTime()
  const monthlyTotals = new Map<string, MutableMoneyTotal>()
  const annualTotals = new Map<string, MutableMoneyTotal>()
  const remainingTotals = new Map<string, MutableMoneyTotal>()
  const currencySummaryMap = new Map<string, CurrencyRenewalSummary>()
  const upcoming: RenewalItem[] = []

  let recurringCount = 0
  let oneTimeCount = 0
  let freeCount = 0
  let expiredCount = 0
  let dueSoonCount = 0
  let missingExpiryCount = 0
  let invalidCount = 0
  let longTermCount = 0

  for (const node of nodes) {
    const price = Number(node.price)

    if (!Number.isFinite(price)) {
      invalidCount += 1
      continue
    }

    if (price <= 0) {
      freeCount += 1
      continue
    }

    if (node.billing_cycle === -1) {
      oneTimeCount += 1
      continue
    }

    const cycle = parseCycle(Number(node.billing_cycle))
    if (!cycle) {
      invalidCount += 1
      continue
    }

    const currency = normalizeCurrency(node.currency)
    const monthly = price / cycle.months
    const annual = monthly * 12
    recurringCount += 1

    addMoney(monthlyTotals, currency, monthly)
    addMoney(annualTotals, currency, annual)
    addCurrencySummary(currencySummaryMap, currency, monthly, annual)

    const expiry = parseExpiry(node.expired_at, nowMs)
    if (expiry === undefined) {
      missingExpiryCount += 1
      continue
    }
    if (expiry === null) {
      invalidCount += 1
      continue
    }

    if (expiry.isExpired) {
      expiredCount += 1
    }
    else if (expiry.isLongTerm) {
      longTermCount += 1
    }
    else {
      const remainingRatio = Math.min(1, Math.max(0, expiry.remainingMs / (cycle.days * DAY_MS)))
      const remaining = price * remainingRatio
      addMoney(remainingTotals, currency, remaining)
      addRemainingToCurrencySummary(currencySummaryMap, currency, remaining)
    }

    if (!expiry.isExpired && expiry.daysLeft <= 30)
      dueSoonCount += 1

    if (!expiry.isLongTerm) {
      upcoming.push({
        uuid: node.uuid,
        name: node.name,
        price,
        currencyCode: currency.code,
        currencySymbol: currency.symbol,
        cycleLabel: cycle.label,
        cycleShortLabel: cycle.shortLabel,
        daysLeft: expiry.daysLeft,
        expiresAtMs: expiry.ms,
        autoRenewal: node.auto_renewal,
        isExpired: expiry.isExpired,
      })
    }
  }

  return {
    recurringCount,
    oneTimeCount,
    freeCount,
    expiredCount,
    dueSoonCount,
    missingExpiryCount,
    invalidCount,
    longTermCount,
    monthlyTotals: toMoneyTotals(monthlyTotals),
    annualTotals: toMoneyTotals(annualTotals),
    remainingTotals: toMoneyTotals(remainingTotals),
    currencySummaries: sortCurrencySummaries(Array.from(currencySummaryMap.values())),
    upcoming: upcoming.sort((a, b) => a.expiresAtMs - b.expiresAtMs).slice(0, 6),
    hasRecurringCosts: recurringCount > 0,
  }
}

export function formatMoney(amount: number, currencyCode: string, currencySymbol: string): string {
  if (!Number.isFinite(amount))
    return '-'

  const shouldUseInteger = INTEGER_CURRENCY_CODES.has(currencyCode)
    || Math.abs(amount - Math.round(amount)) < 0.005

  const formatted = amount.toLocaleString('zh-CN', {
    maximumFractionDigits: shouldUseInteger ? 0 : 2,
    minimumFractionDigits: 0,
  })

  return `${currencySymbol}${formatted}`
}

export function formatMoneyTotal(total: MoneyTotal): string {
  return formatMoney(total.amount, total.currencyCode, total.currencySymbol)
}

export function formatMoneyTotals(totals: MoneyTotal[], emptyText = '-'): string {
  if (totals.length === 0)
    return emptyText

  const visible = totals.slice(0, 3).map(formatMoneyTotal)
  const hiddenCount = totals.length - visible.length
  return hiddenCount > 0 ? `${visible.join(' / ')} +${hiddenCount}` : visible.join(' / ')
}

export function formatRenewalDate(ms: number): string {
  const date = new Date(ms)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatRenewalDays(daysLeft: number): string {
  if (daysLeft < 0)
    return `已过期 ${Math.abs(daysLeft)} 天`
  if (daysLeft === 0)
    return '今天'
  if (daysLeft === 1)
    return '明天'
  return `${daysLeft} 天`
}

export function getRenewalUrgencyType(daysLeft: number): 'default' | 'error' | 'success' | 'warning' {
  if (daysLeft < 0 || daysLeft <= 7)
    return 'error'
  if (daysLeft <= 30)
    return 'warning'
  return 'success'
}
