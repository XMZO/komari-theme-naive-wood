<script setup lang="ts">
import { computed } from 'vue'
import LiquidGlass from '@/components/LiquidGlass.vue'
import { useAppStore } from '@/stores/app'

const props = withDefaults(defineProps<{
  scope: 'node-card' | 'cards' | 'interface'
  as?: 'div' | 'span'
  enabled?: boolean
}>(), {
  as: 'div',
  enabled: true,
})

const appStore = useAppStore()

const enabled = computed(() => props.enabled && appStore.isLiquidGlassScopeEnabled(props.scope))
const options = computed(() => appStore.liquidGlassOptions)
</script>

<template>
  <LiquidGlass
    :as="props.as"
    :enabled="enabled"
    :tint="options.tint"
    :blur="options.blur"
    :chromatic-aberration="options.chromaticAberration"
    :depth="options.depth"
    :strength="options.strength"
    :class="{ 'liquid-glass-surface--enabled': enabled }"
  >
    <slot :enabled="enabled" />
  </LiquidGlass>
</template>

<style scoped lang="scss">
.liquid-glass-surface--enabled {
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.08);
}
</style>
