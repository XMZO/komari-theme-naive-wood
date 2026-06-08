<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { useNow } from '@vueuse/core'
import { NCard, NEmpty, NTag, NText } from 'naive-ui'
import { computed } from 'vue'
import LiquidGlassSurface from '@/components/LiquidGlassSurface.vue'
import { useAppStore } from '@/stores/app'
import {
  buildRenewalStats,
  formatMoney,
  formatMoneyTotals,
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

const appStore = useAppStore()
const now = useNow({ interval: 60000 })

const stats = computed(() => buildRenewalStats(props.nodes, now.value))
const hasLiquidGlass = computed(() => appStore.isLiquidGlassScopeEnabled('cards'))

const monthlyText = computed(() => formatMoneyTotals(stats.value.monthlyTotals))
const annualText = computed(() => formatMoneyTotals(stats.value.annualTotals))
const remainingText = computed(() => formatMoneyTotals(stats.value.remainingTotals, '0'))

const dueSoonText = computed(() => {
  const due = stats.value.dueSoonCount
  if (stats.value.expiredCount > 0)
    return `${due} 待续 · ${stats.value.expiredCount} 过期`
  return `${due}`
})

const visibleCurrencySummaries = computed(() => stats.value.currencySummaries.slice(0, 4))

const summaryTags = computed(() => {
  const items: Array<{ label: string, type: 'default' | 'error' | 'success' | 'warning' }> = [
    { label: `${stats.value.recurringCount} 个周期项目`, type: 'success' as const },
    { label: `${stats.value.oneTimeCount} 个一次性`, type: 'default' as const },
    { label: `${stats.value.freeCount} 个免费/未标价`, type: 'default' as const },
  ]

  if (stats.value.missingExpiryCount > 0) {
    items.push({ label: `${stats.value.missingExpiryCount} 个缺到期`, type: 'warning' as const })
  }

  if (stats.value.invalidCount > 0) {
    items.push({ label: `${stats.value.invalidCount} 个未计入`, type: 'error' as const })
  }

  return items
})
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
        hoverable
        class="renewal-stats-card"
        :class="[appStore.cardMaterialClass, appStore.cardMaterialBlurClass]"
      >
        <div class="renewal-stats-layout">
          <div class="renewal-stats-header">
            <div class="renewal-stats-heading">
              <NText class="renewal-stats-title">
                <span class="i-icon-park-outline-bill renewal-stats-title__icon" />
                续费统计
              </NText>
              <NText :depth="3" class="renewal-stats-subtitle">
                当前价格与计费周期估算，不做跨币种换算
              </NText>
            </div>
            <div class="renewal-stats-tags">
              <NTag v-for="tag in summaryTags" :key="tag.label" size="small" :type="tag.type">
                {{ tag.label }}
              </NTag>
            </div>
          </div>

          <div v-if="stats.hasRecurringCosts" class="renewal-metrics">
            <div class="renewal-metric">
              <NText :depth="3" class="renewal-metric__label">
                月均支出
              </NText>
              <NText class="renewal-metric__value" :style="{ fontFamily: appStore.numberFontFamily }">
                {{ monthlyText }}
              </NText>
            </div>
            <div class="renewal-metric">
              <NText :depth="3" class="renewal-metric__label">
                年化估算
              </NText>
              <NText class="renewal-metric__value" :style="{ fontFamily: appStore.numberFontFamily }">
                {{ annualText }}
              </NText>
            </div>
            <div class="renewal-metric">
              <NText :depth="3" class="renewal-metric__label">
                30 天内续费
              </NText>
              <NText class="renewal-metric__value" :style="{ fontFamily: appStore.numberFontFamily }">
                {{ dueSoonText }}
              </NText>
            </div>
            <div class="renewal-metric">
              <NText :depth="3" class="renewal-metric__label">
                剩余价值
              </NText>
              <NText class="renewal-metric__value" :style="{ fontFamily: appStore.numberFontFamily }">
                {{ remainingText }}
              </NText>
            </div>
          </div>

          <div v-if="stats.hasRecurringCosts" class="renewal-detail-grid">
            <section class="renewal-panel">
              <div class="renewal-panel__header">
                <NText class="renewal-panel__title">
                  近期续费
                </NText>
                <NText :depth="3" class="renewal-panel__meta">
                  {{ stats.upcoming.length }} 项
                </NText>
              </div>
              <div v-if="stats.upcoming.length > 0" class="renewal-list">
                <div v-for="item in stats.upcoming" :key="item.uuid" class="renewal-row">
                  <div class="renewal-row__main">
                    <NText class="renewal-row__name">
                      {{ item.name }}
                    </NText>
                    <NText :depth="3" class="renewal-row__meta">
                      {{ formatRenewalDate(item.expiresAtMs) }} · {{ item.autoRenewal ? '自动续费' : '手动续费' }}
                    </NText>
                  </div>
                  <div class="renewal-row__side">
                    <NTag size="small" :type="getRenewalUrgencyType(item.daysLeft)">
                      {{ formatRenewalDays(item.daysLeft) }}
                    </NTag>
                    <NText class="renewal-row__price" :style="{ fontFamily: appStore.numberFontFamily }">
                      {{ formatMoney(item.price, item.currencyCode, item.currencySymbol) }}/{{ item.cycleShortLabel }}
                    </NText>
                  </div>
                </div>
              </div>
              <NEmpty v-else size="small" description="暂无可排序的到期时间" />
            </section>

            <section class="renewal-panel">
              <div class="renewal-panel__header">
                <NText class="renewal-panel__title">
                  币种汇总
                </NText>
                <NText :depth="3" class="renewal-panel__meta">
                  {{ stats.currencySummaries.length }} 种
                </NText>
              </div>
              <div class="currency-list">
                <div v-for="item in visibleCurrencySummaries" :key="item.currencyCode" class="currency-row">
                  <div class="currency-row__code">
                    <NText class="currency-row__symbol">
                      {{ item.currencySymbol || item.currencyCode }}
                    </NText>
                    <NText :depth="3" class="currency-row__label">
                      {{ item.label }}
                    </NText>
                  </div>
                  <div class="currency-row__amounts">
                    <NText class="currency-row__amount" :style="{ fontFamily: appStore.numberFontFamily }">
                      {{ formatMoney(item.monthly, item.currencyCode, item.currencySymbol) }}/月
                    </NText>
                    <NText :depth="3" class="currency-row__meta">
                      剩余 {{ formatMoney(item.remaining, item.currencyCode, item.currencySymbol) }}
                    </NText>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <NEmpty v-else size="small" description="暂无周期续费项目" />
        </div>
      </NCard>
    </LiquidGlassSurface>
  </div>
</template>

<style scoped lang="scss">
.renewal-stats {
  padding: 0 16px 16px;
}

.renewal-stats--embedded {
  padding: 0;
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
  gap: 16px;
}

.renewal-stats-header {
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
  gap: 6px;
  align-items: center;
  font-size: 1rem;
  font-weight: 700;
}

.renewal-stats-title__icon {
  flex-shrink: 0;
  color: var(--primary-color);
}

.renewal-stats-subtitle {
  font-size: 0.75rem;
}

.renewal-stats-tags {
  display: flex;
  max-width: 58%;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.renewal-metrics {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.renewal-metric {
  display: flex;
  min-width: 0;
  min-height: 76px;
  flex-direction: column;
  gap: 8px;
  justify-content: space-between;
  padding: 12px;
  background-color: color-mix(in srgb, var(--n-color-hover) 78%, transparent);
  border: 1px solid color-mix(in srgb, var(--n-border-color) 70%, transparent);
  border-radius: var(--n-border-radius);
}

.renewal-metric__label {
  font-size: 0.75rem;
}

.renewal-metric__value {
  font-size: 1.08rem;
  font-weight: 750;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.renewal-detail-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
}

.renewal-panel {
  min-width: 0;
  padding: 12px;
  background-color: color-mix(in srgb, var(--n-color-hover) 54%, transparent);
  border: 1px solid color-mix(in srgb, var(--n-border-color) 58%, transparent);
  border-radius: var(--n-border-radius);
}

.renewal-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.renewal-panel__title {
  font-size: 0.9rem;
  font-weight: 700;
}

.renewal-panel__meta {
  flex-shrink: 0;
  font-size: 0.75rem;
}

.renewal-list,
.currency-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.renewal-row,
.currency-row {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.renewal-row {
  padding: 8px 0;
  border-top: 1px solid color-mix(in srgb, var(--n-border-color) 48%, transparent);
}

.renewal-row:first-child {
  padding-top: 0;
  border-top: 0;
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
  font-size: 0.875rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.renewal-row__meta,
.currency-row__meta {
  font-size: 0.72rem;
}

.renewal-row__side {
  display: flex;
  min-width: 150px;
  flex-shrink: 0;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}

.renewal-row__price {
  max-width: 100%;
  font-size: 0.78rem;
  font-weight: 650;
  overflow-wrap: anywhere;
  text-align: right;
}

.currency-row {
  padding: 8px 0;
  border-top: 1px solid color-mix(in srgb, var(--n-border-color) 48%, transparent);
}

.currency-row:first-child {
  padding-top: 0;
  border-top: 0;
}

.currency-row__code {
  display: flex;
  min-width: 72px;
  flex-direction: column;
  gap: 3px;
}

.currency-row__symbol {
  font-size: 0.95rem;
  font-weight: 750;
}

.currency-row__label {
  font-size: 0.72rem;
}

.currency-row__amounts {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  align-items: flex-end;
  text-align: right;
}

.currency-row__amount {
  font-size: 0.84rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.light-renewal-contrast :deep(.n-card) {
  background-color: rgba(250, 250, 252, 1) !important;
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.08);
}

@media (max-width: 1024px) {
  .renewal-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .renewal-detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .renewal-stats-header,
  .renewal-row,
  .currency-row {
    align-items: stretch;
    flex-direction: column;
  }

  .renewal-stats-tags {
    max-width: none;
    justify-content: flex-start;
  }

  .renewal-metrics {
    grid-template-columns: 1fr;
  }

  .renewal-row__side,
  .currency-row__amounts {
    min-width: 0;
    align-items: flex-start;
    text-align: left;
  }
}
</style>
