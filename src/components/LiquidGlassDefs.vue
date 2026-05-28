<template>
  <svg
    aria-hidden="true"
    class="liquid-glass-defs"
    color-interpolation-filters="sRGB"
    focusable="false"
    height="0"
    width="0"
  >
    <defs>
      <filter id="komari-liquid-glass-distortion" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.012 0.018"
          numOctaves="2"
          seed="26"
          result="noise"
        />
        <feGaussianBlur in="noise" stdDeviation="1.25" result="softNoise" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="softNoise"
          scale="42"
          xChannelSelector="R"
          yChannelSelector="G"
          result="displaced"
        />
        <feColorMatrix in="displaced" type="saturate" values="1.35" />
      </filter>
    </defs>
  </svg>
</template>

<style scoped lang="scss">
.liquid-glass-defs {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
}
</style>
