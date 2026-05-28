<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLiquidGlass } from '@/utils/useLiquidGlass'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  enabled?: boolean
  as?: 'div' | 'span'
  tint?: 'transparent' | 'black' | 'white'
  blur?: number
  chromaticAberration?: number
  depth?: number
  strength?: number
  brightness?: number
  saturate?: number
}>(), {
  enabled: true,
  as: 'div',
  tint: 'transparent',
  blur: 0,
  chromaticAberration: 0,
  depth: 10,
  strength: 100,
  brightness: 1.1,
  saturate: 1.5,
})

const rootRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const filterRef = ref<HTMLElement | null>(null)

const rootTag = computed(() => props.as)
const contentTag = computed(() => props.as)

useLiquidGlass(rootRef, {
  enabled: () => props.enabled,
  contentElement: contentRef,
  filterElement: filterRef,
  blur: () => props.blur,
  chromaticAberration: () => props.chromaticAberration,
  depth: () => props.depth,
  strength: () => props.strength,
  brightness: () => props.brightness,
  saturate: () => props.saturate,
})
</script>

<template>
  <component :is="rootTag" ref="rootRef" class="liquid-glass" :class="{ 'liquid-glass--enabled': props.enabled }" v-bind="$attrs">
    <span class="liquid-glass__overlay" :class="`liquid-glass__overlay--${props.tint}`" />
    <component :is="contentTag" ref="contentRef" class="liquid-glass__content">
      <slot />
    </component>
    <span ref="filterRef" class="liquid-glass__filter" :class="`liquid-glass__filter--${props.tint}`" />
  </component>
</template>

<style scoped lang="scss">
.liquid-glass {
  position: relative;
}

.liquid-glass--enabled {
  overflow: hidden;
  isolation: isolate;
  border-radius: var(--n-border-radius, inherit);
}

.liquid-glass__overlay,
.liquid-glass__filter {
  position: absolute;
  inset: 0;
  display: none;
  pointer-events: none;
}

.liquid-glass--enabled > .liquid-glass__overlay,
.liquid-glass--enabled > .liquid-glass__filter {
  display: block;
}

.liquid-glass__overlay {
  z-index: 1;
}

.liquid-glass__overlay--transparent {
  background: rgba(255, 255, 255, 0.1);
}

.liquid-glass__overlay--black {
  background: rgba(0, 0, 0, 0.3);
}

.liquid-glass__overlay--white {
  background: rgba(255, 255, 255, 0.1);
}

.liquid-glass__content {
  position: relative;
  z-index: 3;
  width: 100%;
  height: 100%;
}

.liquid-glass__filter {
  z-index: 2;
}

.liquid-glass__filter--black {
  background: #09090b80;
  box-shadow: inset 0 0 4px 0 #fafafa80;
  filter: brightness(0.6);
}

.liquid-glass__filter--white {
  background: #fafafa80;
  box-shadow: inset 0 0 4px 0 #fafafa80;
}

.liquid-glass__filter--transparent {
  background: #09090b00;
  box-shadow: inset 0 0 4px 0 #fafafa80;
}
</style>
