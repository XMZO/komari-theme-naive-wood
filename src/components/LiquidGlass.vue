<script setup lang="ts">
import { computed } from 'vue'

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
}>(), {
  enabled: true,
  as: 'div',
  tint: 'transparent',
  backgroundUrl: '',
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
  const backgroundUrl = props.backgroundUrl.trim()

  return {
    '--lg-caustic': `${0.24 + strength / 260}`,
    '--lg-chroma': `${chroma / 2}px`,
    '--lg-depth': `${Math.max(8, depth + 8)}px`,
    '--lg-edge': `${0.28 + depth / 82}`,
    '--lg-lens-bg': backgroundUrl ? `url("${backgroundUrl.replace(/"/g, '\\"')}")` : 'none',
    '--lg-lens-inset': `${Math.max(6, 18 - depth / 2)}px`,
    '--lg-lens-opacity': backgroundUrl ? `${0.18 + strength / 360}` : '0',
    '--lg-lens-scale': `${112 + Math.round(strength / 7)}%`,
    '--lg-ridge': `${Math.max(10, depth + softness + 12)}px`,
    '--lg-shine': `${0.18 + strength / 300}`,
    '--lg-soft': `${12 + softness}px`,
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
    <span class="liquid-glass__lens liquid-glass__lens--primary" />
    <span class="liquid-glass__lens liquid-glass__lens--secondary" />
    <span class="liquid-glass__tint" />
    <span class="liquid-glass__well" />
    <span class="liquid-glass__edge" />
    <span class="liquid-glass__shine" />
    <span class="liquid-glass__caustic" />
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
    0 14px 34px rgba(0, 0, 0, 0.11),
    inset 0 1px 0 rgba(255, 255, 255, calc(var(--lg-edge) * 1.4)),
    inset 0 0 0 1px rgba(255, 255, 255, calc(var(--lg-edge) * 0.75));
}

.liquid-glass__lens,
.liquid-glass__tint,
.liquid-glass__well,
.liquid-glass__edge,
.liquid-glass__shine,
.liquid-glass__caustic,
.liquid-glass__chroma {
  position: absolute;
  inset: 0;
  display: none;
  border-radius: inherit;
  pointer-events: none;
}

.liquid-glass--enabled > .liquid-glass__lens,
.liquid-glass--enabled > .liquid-glass__tint,
.liquid-glass--enabled > .liquid-glass__well,
.liquid-glass--enabled > .liquid-glass__edge,
.liquid-glass--enabled > .liquid-glass__shine,
.liquid-glass--enabled > .liquid-glass__caustic,
.liquid-glass--enabled > .liquid-glass__chroma {
  display: block;
}

.liquid-glass__lens {
  background-image: var(--lg-lens-bg);
  background-repeat: no-repeat;
  background-size: var(--lg-lens-scale) var(--lg-lens-scale);
  opacity: var(--lg-lens-opacity);
}

.liquid-glass__lens--primary {
  inset: calc(var(--lg-lens-inset) * -1);
  z-index: 0;
  background-position: 48% 42%;
  border-radius: calc(var(--n-border-radius, 0px) + var(--lg-lens-inset));
}

.liquid-glass__lens--secondary {
  inset: var(--lg-lens-inset);
  z-index: 1;
  background-position: 54% 58%;
  background-size: calc(var(--lg-lens-scale) + 14%) calc(var(--lg-lens-scale) + 14%);
  opacity: calc(var(--lg-lens-opacity) * 0.72);
}

.liquid-glass__tint {
  z-index: 2;
}

.liquid-glass--transparent > .liquid-glass__tint {
  background:
    radial-gradient(140% 100% at 50% 0%, rgba(255, 255, 255, 0.18), transparent 46%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.035) 48%, rgba(255, 255, 255, 0.12)),
    rgba(255, 255, 255, 0.055);
}

.liquid-glass--white > .liquid-glass__tint {
  background:
    radial-gradient(140% 100% at 50% 0%, rgba(255, 255, 255, 0.3), transparent 48%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.22)),
    rgba(255, 255, 255, 0.13);
}

.liquid-glass--black > .liquid-glass__tint {
  background:
    radial-gradient(140% 100% at 50% 0%, rgba(255, 255, 255, 0.12), transparent 48%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(10, 10, 14, 0.24) 54%, rgba(255, 255, 255, 0.07)),
    rgba(10, 10, 14, 0.18);
}

.liquid-glass__well {
  z-index: 3;
  box-shadow:
    inset 0 var(--lg-depth) var(--lg-ridge) rgba(255, 255, 255, calc(var(--lg-edge) * 0.45)),
    inset 0 calc(var(--lg-depth) * -1) var(--lg-ridge) rgba(0, 0, 0, 0.12),
    inset var(--lg-depth) 0 var(--lg-ridge) rgba(255, 255, 255, 0.1),
    inset calc(var(--lg-depth) * -1) 0 var(--lg-ridge) rgba(0, 0, 0, 0.08);
}

.liquid-glass__edge {
  z-index: 4;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, calc(var(--lg-edge) * 1.1)),
    inset 0 0 0 2px rgba(255, 255, 255, calc(var(--lg-edge) * 0.22)),
    inset 0 3px 2px rgba(255, 255, 255, calc(var(--lg-edge) * 1.25)),
    inset 0 -2px 3px rgba(0, 0, 0, 0.16);
}

.liquid-glass__shine {
  z-index: 5;
  background:
    radial-gradient(70% 80% at 18% 0%, rgba(255, 255, 255, calc(var(--lg-shine) * 1.8)), transparent 43%),
    radial-gradient(56% 46% at 88% 18%, rgba(255, 255, 255, calc(var(--lg-shine) * 0.74)), transparent 56%),
    linear-gradient(
      115deg,
      rgba(255, 255, 255, calc(var(--lg-shine) * 1.15)),
      transparent 24% 68%,
      rgba(255, 255, 255, calc(var(--lg-shine) * 0.62))
    ),
    linear-gradient(180deg, rgba(255, 255, 255, calc(var(--lg-shine) * 0.72)), transparent 34%);
  opacity: 0.92;
}

.liquid-glass__caustic {
  z-index: 6;
  background:
    radial-gradient(
      80% 180% at 12% 50%,
      transparent 34%,
      rgba(255, 255, 255, calc(var(--lg-caustic) * 0.35)) 36%,
      transparent 41%
    ),
    radial-gradient(
      90% 160% at 88% 50%,
      transparent 33%,
      rgba(255, 255, 255, calc(var(--lg-caustic) * 0.24)) 36%,
      transparent 43%
    ),
    linear-gradient(
      96deg,
      transparent 8%,
      rgba(255, 255, 255, calc(var(--lg-caustic) * 0.2)) 12%,
      transparent 18% 82%,
      rgba(255, 255, 255, calc(var(--lg-caustic) * 0.16)) 88%,
      transparent 94%
    );
  opacity: 0.8;
}

.liquid-glass__chroma {
  z-index: 7;
  opacity: 0.32;
  box-shadow:
    inset var(--lg-chroma) 0 0 rgba(255, 80, 80, 0.58),
    inset calc(var(--lg-chroma) * -1) 0 0 rgba(64, 150, 255, 0.58),
    inset 0 var(--lg-chroma) 0 rgba(255, 235, 160, 0.22),
    inset 0 calc(var(--lg-chroma) * -1) 0 rgba(82, 180, 255, 0.16);
}

.liquid-glass__content {
  position: relative;
  z-index: 8;
  width: 100%;
  height: 100%;
}
</style>
