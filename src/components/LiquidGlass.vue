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
  backgroundUrl?: string
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
  backgroundUrl: '',
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
  backgroundUrl: () => props.backgroundUrl,
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
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.24),
    rgba(255, 255, 255, 0.04) 55%,
    rgba(255, 255, 255, 0.16)
  );
}

.liquid-glass__overlay--black {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.24) 55%, rgba(255, 255, 255, 0.06));
}

.liquid-glass__overlay--white {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.34),
    rgba(255, 255, 255, 0.08) 55%,
    rgba(255, 255, 255, 0.2)
  );
}

.liquid-glass__content {
  position: relative;
  z-index: 3;
  width: 100%;
  height: 100%;
}

.liquid-glass__filter {
  z-index: 2;
  background-repeat: no-repeat;
}

.liquid-glass__filter--black {
  background-color: #09090b1f;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 12px 30px rgba(0, 0, 0, 0.18);
}

.liquid-glass__filter--white {
  background-color: #fafafa1f;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    0 12px 30px rgba(0, 0, 0, 0.08);
}

.liquid-glass__filter--transparent {
  background-color: #09090b00;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 12px 30px rgba(0, 0, 0, 0.1);
}
</style>
