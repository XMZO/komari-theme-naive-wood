<script setup lang="ts">
import { computed } from 'vue'

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
}>(), {
  enabled: true,
  as: 'div',
  tint: 'transparent',
  blur: 0,
  chromaticAberration: 0,
  depth: 10,
  strength: 48,
})

const rootTag = computed(() => props.as)
const contentTag = computed(() => props.as)

const styleVars = computed(() => {
  const strength = Math.min(120, Math.max(0, props.strength))
  const depth = Math.min(32, Math.max(0, props.depth))
  const softness = Math.min(24, Math.max(0, props.blur))
  const chroma = Math.min(24, Math.max(0, props.chromaticAberration))

  return {
    '--lg-shine': `${0.12 + strength / 420}`,
    '--lg-edge': `${0.16 + depth / 100}`,
    '--lg-soft': `${8 + softness}px`,
    '--lg-chroma': `${chroma / 2}px`,
  }
})
</script>

<template>
  <component
    :is="rootTag"
    class="liquid-glass"
    :class="[
      `liquid-glass--${props.tint}`,
      { 'liquid-glass--enabled': props.enabled },
    ]"
    :style="styleVars"
    v-bind="$attrs"
  >
    <span class="liquid-glass__tint" />
    <span class="liquid-glass__edge" />
    <span class="liquid-glass__shine" />
    <span class="liquid-glass__chroma" />
    <component :is="contentTag" class="liquid-glass__content">
      <slot />
    </component>
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
  background-clip: padding-box;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, calc(var(--lg-edge) * 1.6)),
    inset 0 0 0 1px rgba(255, 255, 255, var(--lg-edge));
}

.liquid-glass__tint,
.liquid-glass__edge,
.liquid-glass__shine,
.liquid-glass__chroma {
  position: absolute;
  inset: 0;
  display: none;
  border-radius: inherit;
  pointer-events: none;
}

.liquid-glass--enabled > .liquid-glass__tint,
.liquid-glass--enabled > .liquid-glass__edge,
.liquid-glass--enabled > .liquid-glass__shine,
.liquid-glass--enabled > .liquid-glass__chroma {
  display: block;
}

.liquid-glass__tint {
  z-index: 0;
}

.liquid-glass--transparent > .liquid-glass__tint {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.02) 52%, rgba(255, 255, 255, 0.1)),
    rgba(255, 255, 255, 0.08);
}

.liquid-glass--white > .liquid-glass__tint {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.08) 55%, rgba(255, 255, 255, 0.18)),
    rgba(255, 255, 255, 0.18);
}

.liquid-glass--black > .liquid-glass__tint {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(10, 10, 14, 0.24) 58%, rgba(255, 255, 255, 0.05)),
    rgba(10, 10, 14, 0.22);
}

.liquid-glass__edge {
  z-index: 1;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, calc(var(--lg-edge) * 1.45)),
    inset 0 1px 2px rgba(255, 255, 255, calc(var(--lg-edge) * 1.8)),
    inset 0 -14px var(--lg-soft) rgba(0, 0, 0, 0.08);
}

.liquid-glass__shine {
  z-index: 2;
  background:
    radial-gradient(120% 90% at 12% 0%, rgba(255, 255, 255, calc(var(--lg-shine) * 1.4)), transparent 46%),
    linear-gradient(
      115deg,
      rgba(255, 255, 255, calc(var(--lg-shine) * 1.05)),
      transparent 28% 72%,
      rgba(255, 255, 255, calc(var(--lg-shine) * 0.72))
    ),
    linear-gradient(180deg, rgba(255, 255, 255, calc(var(--lg-shine) * 0.58)), transparent 36%);
  opacity: 0.88;
}

.liquid-glass__chroma {
  z-index: 3;
  opacity: 0.2;
  box-shadow:
    inset var(--lg-chroma) 0 0 rgba(255, 92, 92, 0.5),
    inset calc(var(--lg-chroma) * -1) 0 0 rgba(68, 144, 255, 0.5);
}

.liquid-glass__content {
  position: relative;
  z-index: 4;
  width: 100%;
  height: 100%;
}
</style>
