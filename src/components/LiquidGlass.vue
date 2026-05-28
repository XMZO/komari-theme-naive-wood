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
  chromaticAberration: 2,
  depth: 10,
  strength: 48,
})

const rootTag = computed(() => props.as)
const contentTag = computed(() => props.as)

const styleVars = computed(() => {
  const blur = Math.min(24, Math.max(0, props.blur))
  const chroma = Math.min(24, Math.max(0, props.chromaticAberration))
  const depth = Math.min(32, Math.max(0, props.depth))
  const strength = Math.min(120, Math.max(0, props.strength))

  return {
    '--lg-blur': `${Math.max(1.5, blur || 3)}px`,
    '--lg-chroma': `${Math.max(0.75, chroma / 1.5)}px`,
    '--lg-depth': `${Math.max(10, depth + 10)}px`,
    '--lg-shadow': `${0.12 + depth / 120}`,
    '--lg-shine': `${0.22 + strength / 260}`,
    '--lg-strength': `${0.16 + strength / 300}`,
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
    <span class="liquid-glass__material" />
    <span class="liquid-glass__tint" />
    <span class="liquid-glass__rim" />
    <span class="liquid-glass__specular" />
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
  background-color: transparent !important;
  box-shadow:
    0 16px 38px rgba(0, 0, 0, var(--lg-shadow)),
    inset 0 0 0 1px rgba(255, 255, 255, 0.28);
}

.liquid-glass__material,
.liquid-glass__tint,
.liquid-glass__rim,
.liquid-glass__specular,
.liquid-glass__chroma {
  position: absolute;
  inset: 0;
  display: none;
  border-radius: inherit;
  pointer-events: none;
}

.liquid-glass--enabled > .liquid-glass__material,
.liquid-glass--enabled > .liquid-glass__tint,
.liquid-glass--enabled > .liquid-glass__rim,
.liquid-glass--enabled > .liquid-glass__specular,
.liquid-glass--enabled > .liquid-glass__chroma {
  display: block;
}

.liquid-glass__material {
  z-index: 0;
  background-color: rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(var(--lg-blur)) url('#komari-liquid-glass-distortion') saturate(1.45) brightness(1.08);
  -webkit-backdrop-filter: blur(var(--lg-blur)) url('#komari-liquid-glass-distortion') saturate(1.45) brightness(1.08);
}

.liquid-glass--white > .liquid-glass__material {
  background-color: rgba(255, 255, 255, 0.1);
}

.liquid-glass--black > .liquid-glass__material {
  background-color: rgba(8, 8, 12, 0.18);
  backdrop-filter: blur(var(--lg-blur)) url('#komari-liquid-glass-distortion') saturate(1.28) brightness(0.9);
  -webkit-backdrop-filter: blur(var(--lg-blur)) url('#komari-liquid-glass-distortion') saturate(1.28) brightness(0.9);
}

.liquid-glass__tint {
  z-index: 1;
}

.liquid-glass--transparent > .liquid-glass__tint {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.02) 52%, rgba(255, 255, 255, 0.12)),
    radial-gradient(90% 70% at 18% 0%, rgba(255, 255, 255, calc(var(--lg-strength) * 0.9)), transparent 60%);
}

.liquid-glass--white > .liquid-glass__tint {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.06) 52%, rgba(255, 255, 255, 0.2)),
    radial-gradient(90% 70% at 18% 0%, rgba(255, 255, 255, calc(var(--lg-strength) * 1.2)), transparent 60%);
}

.liquid-glass--black > .liquid-glass__tint {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.09), rgba(0, 0, 0, 0.22) 55%, rgba(255, 255, 255, 0.06)),
    radial-gradient(90% 70% at 18% 0%, rgba(255, 255, 255, calc(var(--lg-strength) * 0.48)), transparent 60%);
}

.liquid-glass__rim {
  z-index: 2;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, calc(var(--lg-shine) * 0.9)),
    inset 0 2px 3px rgba(255, 255, 255, calc(var(--lg-shine) * 1.25)),
    inset 0 -2px 4px rgba(0, 0, 0, 0.24),
    inset var(--lg-depth) 0 calc(var(--lg-depth) * 1.35) rgba(255, 255, 255, 0.1),
    inset calc(var(--lg-depth) * -1) 0 calc(var(--lg-depth) * 1.2) rgba(0, 0, 0, 0.1);
}

.liquid-glass__specular {
  z-index: 3;
  background:
    radial-gradient(65% 75% at 14% 0%, rgba(255, 255, 255, calc(var(--lg-shine) * 1.55)), transparent 48%),
    radial-gradient(55% 42% at 94% 18%, rgba(255, 255, 255, calc(var(--lg-shine) * 0.7)), transparent 58%),
    linear-gradient(
      112deg,
      rgba(255, 255, 255, calc(var(--lg-shine) * 0.9)),
      transparent 27% 72%,
      rgba(255, 255, 255, calc(var(--lg-shine) * 0.45))
    );
}

.liquid-glass__chroma {
  z-index: 4;
  opacity: 0.45;
  box-shadow:
    inset var(--lg-chroma) 0 0 rgba(255, 75, 75, 0.5),
    inset calc(var(--lg-chroma) * -1) 0 0 rgba(80, 150, 255, 0.5),
    inset 0 var(--lg-chroma) 0 rgba(255, 245, 160, 0.2),
    inset 0 calc(var(--lg-chroma) * -1) 0 rgba(90, 190, 255, 0.16);
}

.liquid-glass__content {
  position: relative;
  z-index: 5;
  width: 100%;
  height: 100%;
}
</style>
