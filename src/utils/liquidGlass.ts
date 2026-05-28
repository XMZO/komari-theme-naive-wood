/**
 * Liquid glass displacement utilities.
 *
 * Adapted from nikdelvin/liquid-glass (MIT License).
 * Copyright (c) 2025 Nikita Stadnik
 * Source: E:/gayhub/liquid-glass/src/utils/liquidGlass.ts
 */

export interface LiquidGlassDisplacementOptions {
  height: number
  width: number
  radius: number
  depth: number
  strength?: number
  chromaticAberration?: number
}

type DisplacementMapOptions = Omit<LiquidGlassDisplacementOptions, 'chromaticAberration' | 'strength'>

const filterCache = new Map<string, string>()
const MAX_FILTER_CACHE_SIZE = 80

function encodeSvg(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function getLiquidGlassDisplacementMap({
  height,
  width,
  radius,
  depth,
}: DisplacementMapOptions): string {
  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  const safeRadius = Math.max(0, radius)
  const safeDepth = Math.max(0, depth)

  return encodeSvg(`<svg height="${safeHeight}" width="${safeWidth}" viewBox="0 0 ${safeWidth} ${safeHeight}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .mix { mix-blend-mode: screen; }
    </style>
    <defs>
      <linearGradient
        id="Y"
        x1="0"
        x2="0"
        y1="${Math.ceil((safeRadius / safeHeight) * 15)}%"
        y2="${Math.floor(100 - (safeRadius / safeHeight) * 15)}%">
        <stop offset="0%" stop-color="#0F0" />
        <stop offset="100%" stop-color="#000" />
      </linearGradient>
      <linearGradient
        id="X"
        x1="${Math.ceil((safeRadius / safeWidth) * 15)}%"
        x2="${Math.floor(100 - (safeRadius / safeWidth) * 15)}%"
        y1="0"
        y2="0">
        <stop offset="0%" stop-color="#F00" />
        <stop offset="100%" stop-color="#000" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" height="${safeHeight}" width="${safeWidth}" fill="#808080" />
    <g filter="blur(2px)">
      <rect x="0" y="0" height="${safeHeight}" width="${safeWidth}" fill="#000080" />
      <rect x="0" y="0" height="${safeHeight}" width="${safeWidth}" fill="url(#Y)" class="mix" />
      <rect x="0" y="0" height="${safeHeight}" width="${safeWidth}" fill="url(#X)" class="mix" />
      <rect
        x="${safeDepth}"
        y="${safeDepth}"
        height="${Math.max(0, safeHeight - 2 * safeDepth)}"
        width="${Math.max(0, safeWidth - 2 * safeDepth)}"
        fill="#808080"
        rx="${safeRadius}"
        ry="${safeRadius}"
        filter="blur(${safeDepth}px)"
      />
    </g>
  </svg>`)
}

export function getLiquidGlassDisplacementFilter({
  height,
  width,
  radius,
  depth,
  strength = 100,
  chromaticAberration = 0,
}: LiquidGlassDisplacementOptions): string {
  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  const safeRadius = Math.max(0, Math.round(radius))
  const safeDepth = Math.max(0, Math.round(depth))
  const safeStrength = Math.max(0, Math.round(strength))
  const safeChromaticAberration = Math.max(0, Math.round(chromaticAberration))
  const cacheKey = `${safeWidth}:${safeHeight}:${safeRadius}:${safeDepth}:${safeStrength}:${safeChromaticAberration}`
  const cached = filterCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const displacementMap = getLiquidGlassDisplacementMap({
    height: safeHeight,
    width: safeWidth,
    radius: safeRadius,
    depth: safeDepth,
  })

  const filter = `${encodeSvg(`<svg height="${safeHeight}" width="${safeWidth}" viewBox="0 0 ${safeWidth} ${safeHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="displace" color-interpolation-filters="sRGB">
        <feImage x="0" y="0" height="${safeHeight}" width="${safeWidth}" href="${displacementMap}" result="displacementMap" />
        <feDisplacementMap
          transform-origin="center"
          in="SourceGraphic"
          in2="displacementMap"
          scale="${safeStrength + safeChromaticAberration * 2}"
          xChannelSelector="R"
          yChannelSelector="G"
        />
        <feColorMatrix
          type="matrix"
          values="1 0 0 0 0
                  0 0 0 0 0
                  0 0 0 0 0
                  0 0 0 1 0"
          result="displacedR"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="displacementMap"
          scale="${safeStrength + safeChromaticAberration}"
          xChannelSelector="R"
          yChannelSelector="G"
        />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0
                  0 1 0 0 0
                  0 0 0 0 0
                  0 0 0 1 0"
          result="displacedG"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="displacementMap"
          scale="${safeStrength}"
          xChannelSelector="R"
          yChannelSelector="G"
        />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0
                  0 0 0 0 0
                  0 0 1 0 0
                  0 0 0 1 0"
          result="displacedB"
        />
        <feBlend in="displacedR" in2="displacedG" mode="screen" />
        <feBlend in2="displacedB" mode="screen" />
      </filter>
    </defs>
  </svg>`)}#displace`

  filterCache.set(cacheKey, filter)
  if (filterCache.size > MAX_FILTER_CACHE_SIZE) {
    const oldestKey = filterCache.keys().next().value
    if (oldestKey) {
      filterCache.delete(oldestKey)
    }
  }

  return filter
}

export function supportsLiquidGlassBackdropFilter(): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  const testEl = document.createElement('div')
  testEl.style.cssText = 'backdrop-filter: url(#test)'
  return testEl.style.backdropFilter === 'url(#test)' || testEl.style.backdropFilter === 'url("#test")'
}
