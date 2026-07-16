<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import type { CurrencyRenewalSummary, RenewalItem } from '@/utils/renewalStats'
import { useNow } from '@vueuse/core'
import { NCard, NEmpty, NTag, NText } from 'naive-ui'
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import LiquidGlassSurface from '@/components/LiquidGlassSurface.vue'
import { useAppStore } from '@/stores/app'
import {
  buildRenewalStats,
  formatMoney,
  formatRenewalDate,
  formatRenewalDays,
  getRenewalUrgencyType,
} from '@/utils/renewalStats'

const props = withDefaults(defineProps<{
  nodes: NodeData[]
  embedded?: boolean
}>(), {
  embedded: false,
})

type TagType = 'default' | 'error' | 'success' | 'warning'

const appStore = useAppStore()
const now = useNow({ interval: 60000 })

const stats = computed(() => buildRenewalStats(props.nodes, now.value))
const hasLiquidGlass = computed(() => appStore.isLiquidGlassScopeEnabled('cards'))
const unavailableExpiryCount = computed(() => (
  stats.value.missingExpiryCount + stats.value.invalidExpiryCount
))

const scopeTags = computed<Array<{ label: string, type: TagType }>>(() => {
  const result: Array<{ label: string, type: TagType }> = [
    { label: `${stats.value.recurringCount} 个周期付费`, type: 'default' },
    { label: `${stats.value.activeRecurringCount} 个到期日在未来`, type: 'success' },
    { label: `${stats.value.oneTimeCount} 个一次性付费`, type: 'default' },
    { label: `${stats.value.freeCount} 个免费`, type: 'default' },
    { label: `${stats.value.unpricedCount} 个零价格 / 未标价`, type: 'default' },
  ]

  if (stats.value.autoRenewalCount > 0)
    result.push({ label: `${stats.value.autoRenewalCount} 个已开启面板自动顺延`, type: 'default' })
  if (stats.value.manualRenewalCount > 0)
    result.push({ label: `${stats.value.manualRenewalCount} 个手动维护`, type: 'default' })
  if (stats.value.longTermCount > 0)
    result.push({ label: `${stats.value.longTermCount} 个长期有效`, type: 'default' })
  if (stats.value.missingCurrencyCount > 0)
    result.push({ label: `${stats.value.missingCurrencyCount} 个未设币种`, type: 'warning' })
  if (stats.value.invalidPricingCount > 0)
    result.push({ label: `${stats.value.invalidPricingCount} 个价格/周期无效`, type: 'error' })

  return result
})

function formatCurrencyAmount(item: CurrencyRenewalSummary, amount: number): string {
  return formatMoney(amount, item.currencyCode, item.currencySymbol)
}

function formatItemPrice(item: RenewalItem): string {
  return formatMoney(item.price, item.currencyCode, item.currencySymbol, true)
}

function renewalModeLabel(autoRenewal: boolean): string {
  return autoRenewal ? '面板自动顺延' : '手动维护'
}
</script>

<template>
  <div
    class="renewal-stats"
    :class="{
      'renewal-stats--embedded': props.embedded,
      'light-renewal-contrast': appStore.lightCardContrast && !appStore.isDark,
    }"
  >
    <LiquidGlassSurface scope="cards" class="renewal-stats-glass" :class="{ 'renewal-stats-glass--enabled': hasLiquidGlass }">
      <NCard
        class="renewal-stats-card"
        :class="[appStore.cardMaterialClass, appStore.cardMaterialBlurClass]"
      >
        <div class="renewal-stats-layout">
          <header v-if="!props.embedded" class="renewal-stats-header">
            <div class="renewal-stats-heading">
              <NText class="renewal-stats-title">
                <AppIcon name="renewal" class="renewal-stats-title__icon" />
                续费与到期
              </NText>
              <NText :depth="3" class="renewal-stats-subtitle">
                只统计周期付费项目：先处理到期风险，再按币种查看预算
              </NText>
            </div>
          </header>

          <div class="renewal-reading-guide">
            <span><strong>范围</strong>：周期付费项目</span>
            <span><strong>月 / 年</strong>：按当前价格和周期折算</span>
            <span><strong>30 天金额</strong>：下一周期标价</span>
          </div>

          <template v-if="stats.hasRecurringCosts">
            <section class="renewal-section" aria-labelledby="renewal-attention-title">
              <div class="renewal-section__header">
                <div>
                  <NText id="renewal-attention-title" class="renewal-section__title">
                    周期付费到期风险
                  </NText>
                  <NText :depth="3" class="renewal-section__description">
                    以下数量不含免费、零价格 / 未标价和一次性付费项目
                  </NText>
                </div>
              </div>

              <div class="renewal-risk-grid">
                <article class="renewal-risk" :class="{ 'renewal-risk--error': stats.expiredCount > 0 }">
                  <NText :depth="3" class="renewal-risk__label">
                    已过期
                  </NText>
                  <NText class="renewal-risk__value" :style="{ fontFamily: appStore.numberFontFamily }">
                    {{ stats.expiredCount }}
                  </NText>
                  <NText :depth="3" class="renewal-risk__hint">
                    不计入当前有效预算
                  </NText>
                </article>

                <article class="renewal-risk" :class="{ 'renewal-risk--warning': stats.dueSoonCount > 0 }">
                  <NText :depth="3" class="renewal-risk__label">
                    30 天内到期
                  </NText>
                  <NText class="renewal-risk__value" :style="{ fontFamily: appStore.numberFontFamily }">
                    {{ stats.dueSoonCount }}
                  </NText>
                  <NText :depth="3" class="renewal-risk__hint">
                    今天起 30 个日历日内
                  </NText>
                </article>

                <article class="renewal-risk" :class="{ 'renewal-risk--warning': unavailableExpiryCount > 0 }">
                  <NText :depth="3" class="renewal-risk__label">
                    到期日不可用
                  </NText>
                  <NText class="renewal-risk__value" :style="{ fontFamily: appStore.numberFontFamily }">
                    {{ unavailableExpiryCount }}
                  </NText>
                  <NText :depth="3" class="renewal-risk__hint">
                    {{ stats.missingExpiryCount }} 未填写 · {{ stats.invalidExpiryCount }} 格式错误
                  </NText>
                </article>
              </div>
            </section>

            <section class="renewal-section" aria-labelledby="renewal-schedule-title">
              <div class="renewal-section__header">
                <div>
                  <NText id="renewal-schedule-title" class="renewal-section__title">
                    到期日程
                  </NText>
                  <NText :depth="3" class="renewal-section__description">
                    只列周期付费项目；已过期和未来到期分开排序
                  </NText>
                </div>
              </div>

              <div class="renewal-schedule-grid" :class="{ 'renewal-schedule-grid--single': stats.expiredItemCount === 0 }">
                <section v-if="stats.expiredItemCount > 0" class="renewal-panel renewal-panel--expired">
                  <div class="renewal-panel__header">
                    <NText class="renewal-panel__title">
                      已过期
                    </NText>
                    <NText :depth="3" class="renewal-panel__meta">
                      显示 {{ stats.expiredItems.length }} / {{ stats.expiredItemCount }}
                    </NText>
                  </div>
                  <div class="renewal-list">
                    <div v-for="item in stats.expiredItems" :key="item.uuid" class="renewal-row">
                      <div class="renewal-row__main">
                        <NText class="renewal-row__name">
                          {{ item.name }}
                        </NText>
                        <NText :depth="3" class="renewal-row__meta">
                          {{ formatRenewalDate(item.expiresAtMs) }} · {{ item.cycleLabel }} · {{ renewalModeLabel(item.autoRenewal) }}
                        </NText>
                      </div>
                      <div class="renewal-row__side">
                        <NTag size="small" type="error">
                          {{ formatRenewalDays(item.daysLeft, item.expiredLessThanDay) }}
                        </NTag>
                        <NText class="renewal-row__price" :style="{ fontFamily: appStore.numberFontFamily }">
                          {{ formatItemPrice(item) }} / {{ item.cycleShortLabel }}
                        </NText>
                      </div>
                    </div>
                  </div>
                </section>

                <section class="renewal-panel">
                  <div class="renewal-panel__header">
                    <NText class="renewal-panel__title">
                      最近到期
                    </NText>
                    <NText :depth="3" class="renewal-panel__meta">
                      显示 {{ stats.upcomingItems.length }} / {{ stats.upcomingItemCount }}
                    </NText>
                  </div>
                  <div v-if="stats.upcomingItems.length > 0" class="renewal-list">
                    <div v-for="item in stats.upcomingItems" :key="item.uuid" class="renewal-row">
                      <div class="renewal-row__main">
                        <NText class="renewal-row__name">
                          {{ item.name }}
                        </NText>
                        <NText :depth="3" class="renewal-row__meta">
                          {{ formatRenewalDate(item.expiresAtMs) }} · {{ item.cycleLabel }} · {{ renewalModeLabel(item.autoRenewal) }}
                        </NText>
                      </div>
                      <div class="renewal-row__side">
                        <NTag size="small" :type="getRenewalUrgencyType(item.daysLeft)">
                          {{ formatRenewalDays(item.daysLeft) }}
                        </NTag>
                        <NText class="renewal-row__price" :style="{ fontFamily: appStore.numberFontFamily }">
                          {{ formatItemPrice(item) }} / {{ item.cycleShortLabel }}
                        </NText>
                      </div>
                    </div>
                  </div>
                  <NEmpty v-else size="small" description="暂无可排序的未来到期时间" />
                </section>
              </div>
            </section>

            <section class="renewal-section" aria-labelledby="renewal-budget-title">
              <div class="renewal-section__header">
                <div>
                  <NText id="renewal-budget-title" class="renewal-section__title">
                    各币种预算
                  </NText>
                  <NText :depth="3" class="renewal-section__description">
                    当前有效预算只统计到期日在未来的周期项目；状态未知和已过期单独列出
                  </NText>
                </div>
                <NText :depth="3" class="renewal-section__meta">
                  {{ stats.currencySummaries.length }} 种币种
                </NText>
              </div>

              <div v-if="stats.hasBudgetData" class="renewal-currency-grid">
                <article
                  v-for="item in stats.currencySummaries"
                  :key="item.currencyKey"
                  class="renewal-currency"
                >
                  <div class="renewal-currency__header">
                    <div class="renewal-currency__identity">
                      <span class="renewal-currency__code" :title="item.currencyCode">{{ item.currencyCode }}</span>
                      <div>
                        <NText class="renewal-currency__name">
                          {{ item.label }}
                        </NText>
                        <NText :depth="3" class="renewal-currency__count">
                          {{ item.activeCount }} 个到期日在未来 / {{ item.recurringCount }} 个配置
                        </NText>
                      </div>
                    </div>
                  </div>

                  <div class="renewal-currency__primary">
                    <div class="renewal-currency__metric">
                      <NText :depth="3" class="renewal-currency__metric-label">
                        当前月度等效成本
                      </NText>
                      <NText class="renewal-currency__metric-value" :style="{ fontFamily: appStore.numberFontFamily }">
                        {{ formatCurrencyAmount(item, item.activeMonthly) }}
                      </NText>
                    </div>
                    <div class="renewal-currency__metric">
                      <NText :depth="3" class="renewal-currency__metric-label">
                        当前年度等效成本
                      </NText>
                      <NText class="renewal-currency__metric-value" :style="{ fontFamily: appStore.numberFontFamily }">
                        {{ formatCurrencyAmount(item, item.activeAnnual) }}
                      </NText>
                    </div>
                  </div>

                  <div v-if="item.dueWithin30Count > 0" class="renewal-currency__due">
                    <span>30 天内到期标价</span>
                    <strong :style="{ fontFamily: appStore.numberFontFamily }">
                      {{ formatCurrencyAmount(item, item.dueWithin30Amount) }} · {{ item.dueWithin30Count }} 项
                    </strong>
                  </div>

                  <details class="renewal-currency__details">
                    <summary>配置对账</summary>
                    <dl class="renewal-currency__reconciliation">
                      <div>
                        <dt>全部配置折算成本</dt>
                        <dd :style="{ fontFamily: appStore.numberFontFamily }">
                          {{ formatCurrencyAmount(item, item.configuredMonthly) }}/月 · {{ formatCurrencyAmount(item, item.configuredAnnual) }}/年
                        </dd>
                      </div>
                      <div v-if="item.unknownExpiryCount > 0">
                        <dt>到期未知配置</dt>
                        <dd :style="{ fontFamily: appStore.numberFontFamily }">
                          {{ formatCurrencyAmount(item, item.unknownExpiryMonthly) }}/月 · {{ item.unknownExpiryCount }} 项
                        </dd>
                      </div>
                      <div v-if="item.overdueCount > 0">
                        <dt>已过期配置</dt>
                        <dd :style="{ fontFamily: appStore.numberFontFamily }">
                          {{ formatCurrencyAmount(item, item.expiredMonthly) }}/月 · 续费标价合计 {{ formatCurrencyAmount(item, item.overdueRenewalAmount) }}
                        </dd>
                      </div>
                    </dl>
                  </details>
                </article>
              </div>
              <NEmpty v-else size="small" description="周期项目存在，但没有可汇总的币种金额" />

              <NText v-if="stats.missingCurrencyCount > 0" :depth="3" class="renewal-budget-warning">
                另有 {{ stats.missingCurrencyCount }} 个周期项目未设置币种，因此只计入状态数量，不计入金额汇总。
              </NText>
            </section>
          </template>

          <NEmpty v-else size="small" description="暂无周期付费项目；免费、未标价和一次性项目可在下方统计范围中查看" />

          <details class="renewal-scope">
            <summary>统计范围与计算口径</summary>
            <div class="renewal-scope__content">
              <div class="renewal-scope__tags">
                <NTag v-for="tag in scopeTags" :key="tag.label" size="small" :type="tag.type">
                  {{ tag.label }}
                </NTag>
              </div>
              <ul class="renewal-scope__notes">
                <li>上方标签包含项目类型、到期状态和维护方式等不同维度，不能横向相加。</li>
                <li>当前预算仅包含到期时间有效且晚于现在的周期项目；到期未知和已过期配置单独展示。</li>
                <li>月度、年度数字是按当前价格和计费周期折算的成本，不代表当月或当年已经实际扣款。</li>
                <li>30 天内金额按浏览器所在时区的日历日计算，是下一周期标价的同币种合计，不是欠费或真实账单。</li>
                <li>“已开启面板自动顺延”只表示 Komari 会在节点在线、到期日有效等条件满足时推进日期，不表示服务商已自动付款。</li>
                <li>系统没有付款时间、实付金额和本期起点，无法可靠计算“剩余价值”，因此不再展示该估算。</li>
                <li>系统也没有汇率及汇率时点；跨币种相加会产生误导，所以始终按币种分别核算。</li>
              </ul>
            </div>
          </details>
        </div>
      </NCard>
    </LiquidGlassSurface>
  </div>
</template>

<style scoped lang="scss">
.renewal-stats {
  container-type: inline-size;
  padding: 0 16px 16px;
}

.renewal-stats--embedded {
  padding: 0;
}

.renewal-stats--embedded :deep(.n-card__content) {
  padding: 14px;
}

.renewal-stats-glass {
  display: block;
}

.renewal-stats-glass--enabled :deep(.n-card) {
  background-color: transparent !important;
  border-color: rgba(255, 255, 255, 0.42) !important;
  box-shadow: none !important;
}

html.dark .renewal-stats-glass--enabled :deep(.n-card) {
  background-color: transparent !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
}

.renewal-stats-layout {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.renewal-stats-header,
.renewal-section__header,
.renewal-panel__header,
.renewal-currency__header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.renewal-stats-heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.renewal-stats-title {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 1.05rem;
  font-weight: 750;
}

.renewal-stats-title__icon {
  width: 1.05rem;
  height: 1.05rem;
  flex-shrink: 0;
  color: var(--primary-color);
}

.renewal-stats-subtitle,
.renewal-section__description {
  display: block;
  font-size: 0.76rem;
  line-height: 1.55;
}

.renewal-reading-guide {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  padding: 10px 12px;
  color: var(--n-text-color-2);
  background: color-mix(in srgb, var(--primary-color) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 18%, transparent);
  border-radius: var(--n-border-radius);
  font-size: 0.74rem;
  line-height: 1.5;
}

.renewal-reading-guide strong {
  color: var(--n-text-color);
  font-weight: 700;
}

.renewal-section {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
}

.renewal-section__title {
  display: block;
  margin-bottom: 2px;
  font-size: 0.94rem;
  font-weight: 750;
}

.renewal-section__meta,
.renewal-panel__meta {
  flex-shrink: 0;
  font-size: 0.73rem;
}

.renewal-risk-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.renewal-risk {
  display: flex;
  min-width: 0;
  min-height: 108px;
  flex-direction: column;
  justify-content: space-between;
  padding: 13px;
  background: color-mix(in srgb, var(--n-color-hover) 64%, transparent);
  border: 1px solid color-mix(in srgb, var(--n-border-color) 62%, transparent);
  border-radius: var(--n-border-radius);
}

.renewal-risk--error {
  background: color-mix(in srgb, var(--error-color) 7%, transparent);
  border-color: color-mix(in srgb, var(--error-color) 28%, transparent);
}

.renewal-risk--warning {
  background: color-mix(in srgb, var(--warning-color) 8%, transparent);
  border-color: color-mix(in srgb, var(--warning-color) 30%, transparent);
}

.renewal-risk__label,
.renewal-risk__hint {
  font-size: 0.74rem;
}

.renewal-risk__value {
  font-size: 1.65rem;
  font-weight: 780;
  line-height: 1;
}

.renewal-risk__hint {
  line-height: 1.4;
}

.renewal-currency-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.renewal-currency-grid > .renewal-currency:only-child {
  grid-column: 1 / -1;
}

.renewal-currency,
.renewal-panel {
  min-width: 0;
  padding: 13px;
  background: color-mix(in srgb, var(--n-color-hover) 52%, transparent);
  border: 1px solid color-mix(in srgb, var(--n-border-color) 58%, transparent);
  border-radius: var(--n-border-radius);
}

.renewal-currency__identity {
  display: flex;
  min-width: 0;
  gap: 10px;
  align-items: center;
}

.renewal-currency__identity > div {
  min-width: 0;
}

.renewal-currency__code {
  display: inline-flex;
  min-width: 48px;
  max-width: 92px;
  height: 30px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 24%, transparent);
  border-radius: calc(var(--n-border-radius) - 2px);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.renewal-currency__name,
.renewal-panel__title {
  display: block;
  font-size: 0.88rem;
  font-weight: 750;
}

.renewal-currency__count {
  display: block;
  margin-top: 2px;
  font-size: 0.7rem;
}

.renewal-currency__primary {
  display: grid;
  gap: 10px;
  margin-top: 13px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.renewal-currency__metric {
  min-width: 0;
  padding: 10px;
  background: color-mix(in srgb, var(--n-color) 74%, transparent);
  border-radius: calc(var(--n-border-radius) - 2px);
}

.renewal-currency__metric-label,
.renewal-currency__metric-value {
  display: block;
}

.renewal-currency__metric-label {
  margin-bottom: 6px;
  font-size: 0.7rem;
}

.renewal-currency__metric-value {
  font-size: 1rem;
  font-weight: 760;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.renewal-currency__due {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 9px 10px;
  color: var(--warning-color);
  background: color-mix(in srgb, var(--warning-color) 8%, transparent);
  border-radius: calc(var(--n-border-radius) - 2px);
  font-size: 0.72rem;
}

.renewal-currency__due strong {
  overflow-wrap: anywhere;
  text-align: right;
}

.renewal-currency__details {
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid color-mix(in srgb, var(--n-border-color) 48%, transparent);
}

.renewal-currency__details summary {
  cursor: pointer;
  color: var(--n-text-color-3);
  font-size: 0.7rem;
  font-weight: 650;
  user-select: none;
}

.renewal-currency__reconciliation {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 9px 0 0;
}

.renewal-currency__reconciliation > div {
  display: flex;
  min-width: 0;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  font-size: 0.7rem;
  line-height: 1.45;
}

.renewal-currency__reconciliation dt {
  flex-shrink: 0;
  color: var(--n-text-color-3);
}

.renewal-currency__reconciliation dd {
  min-width: 0;
  margin: 0;
  color: var(--n-text-color-2);
  overflow-wrap: anywhere;
  text-align: right;
}

.renewal-budget-warning {
  display: block;
  padding: 0 2px;
  font-size: 0.72rem;
  line-height: 1.5;
}

.renewal-schedule-grid {
  display: grid;
  gap: 12px;
  align-items: start;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
}

.renewal-schedule-grid--single {
  grid-template-columns: 1fr;
}

.renewal-panel--expired {
  border-color: color-mix(in srgb, var(--error-color) 20%, var(--n-border-color));
}

.renewal-panel__header {
  align-items: center;
  margin-bottom: 10px;
}

.renewal-list {
  display: flex;
  flex-direction: column;
}

.renewal-row {
  display: flex;
  min-width: 0;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-top: 1px solid color-mix(in srgb, var(--n-border-color) 46%, transparent);
}

.renewal-row:first-child {
  padding-top: 0;
  border-top: 0;
}

.renewal-row:last-child {
  padding-bottom: 0;
}

.renewal-row__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.renewal-row__name {
  overflow: hidden;
  font-size: 0.82rem;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.renewal-row__meta {
  font-size: 0.68rem;
  line-height: 1.4;
}

.renewal-row__side {
  display: flex;
  min-width: 140px;
  flex-shrink: 0;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}

.renewal-row__price {
  max-width: 100%;
  font-size: 0.72rem;
  font-weight: 650;
  overflow-wrap: anywhere;
  text-align: right;
}

.renewal-scope {
  overflow: hidden;
  background: color-mix(in srgb, var(--n-color-hover) 42%, transparent);
  border: 1px solid color-mix(in srgb, var(--n-border-color) 56%, transparent);
  border-radius: var(--n-border-radius);
}

.renewal-scope summary {
  padding: 11px 13px;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 700;
  user-select: none;
}

.renewal-scope__content {
  padding: 0 13px 13px;
}

.renewal-scope__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.renewal-scope__notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0 0;
  padding-left: 1.2rem;
  color: var(--n-text-color-2);
  font-size: 0.72rem;
  line-height: 1.55;
}

.light-renewal-contrast :deep(.n-card) {
  background-color: rgba(250, 250, 252, 1) !important;
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.08);
}

@container (max-width: 760px) {
  .renewal-currency-grid,
  .renewal-schedule-grid {
    grid-template-columns: 1fr;
  }
}

@container (max-width: 560px) {
  .renewal-stats-header,
  .renewal-section__header {
    align-items: stretch;
    flex-direction: column;
  }

  .renewal-risk-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .renewal-risk:last-child {
    grid-column: 1 / -1;
  }
}

@container (max-width: 420px) {
  .renewal-risk-grid {
    grid-template-columns: 1fr;
  }

  .renewal-risk:last-child {
    grid-column: auto;
  }

  .renewal-currency__primary {
    grid-template-columns: 1fr;
  }

  .renewal-row,
  .renewal-currency__due,
  .renewal-currency__reconciliation > div {
    align-items: stretch;
    flex-direction: column;
  }

  .renewal-row__side {
    min-width: 0;
    align-items: flex-start;
  }

  .renewal-row__price,
  .renewal-currency__due strong,
  .renewal-currency__reconciliation dd {
    text-align: left;
  }
}
</style>
