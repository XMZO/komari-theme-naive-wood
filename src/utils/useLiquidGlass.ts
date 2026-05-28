import type { MaybeRefOrGetter, Ref } from 'vue'
import { onBeforeUnmount, toValue, watchEffect } from 'vue'
import { getLiquidGlassDisplacementFilter, supportsLiquidGlassBackdropFilter } from '@/utils/liquidGlass'

export interface UseLiquidGlassOptions {
  enabled?: MaybeRefOrGetter<boolean>
  contentElement?: MaybeRefOrGetter<HTMLElement | null | undefined>
  filterElement?: MaybeRefOrGetter<HTMLElement | null | undefined>
  blur?: MaybeRefOrGetter<number>
  chromaticAberration?: MaybeRefOrGetter<number>
  depth?: MaybeRefOrGetter<number>
  strength?: MaybeRefOrGetter<number>
  brightness?: MaybeRefOrGetter<number>
  saturate?: MaybeRefOrGetter<number>
}

export function useLiquidGlass(target: Ref<HTMLElement | null>, options: UseLiquidGlassOptions = {}) {
  let resizeObserver: ResizeObserver | undefined

  function getEnabled() {
    return toValue(options.enabled) ?? true
  }

  function getLiquidGlassElement() {
    return toValue(options.filterElement) ?? target.value
  }

  function getContentElement() {
    return toValue(options.contentElement) ?? target.value
  }

  function readBorderRadius(element: HTMLElement): number {
    const value = Number.parseFloat(getComputedStyle(element).borderRadius || '0')
    if (Number.isFinite(value) && value > 0) {
      return value
    }

    const child = element.firstElementChild
    if (child instanceof HTMLElement) {
      const childValue = Number.parseFloat(getComputedStyle(child).borderRadius || '0')
      if (Number.isFinite(childValue) && childValue > 0) {
        return childValue
      }
    }

    return 0
  }

  function redraw() {
    if (!getEnabled())
      return

    const glassElement = getLiquidGlassElement()
    const contentElement = getContentElement()
    if (!glassElement || !contentElement)
      return

    const rect = contentElement.getBoundingClientRect()
    const width = Math.round(rect.width)
    const height = Math.round(rect.height)
    if (width <= 0 || height <= 0)
      return

    const blur = toValue(options.blur) ?? 0
    const chromaticAberration = toValue(options.chromaticAberration) ?? 0
    const depth = toValue(options.depth) ?? 10
    const strength = toValue(options.strength) ?? 100
    const brightness = toValue(options.brightness) ?? 1.1
    const saturate = toValue(options.saturate) ?? 1.5
    const radius = readBorderRadius(target.value ?? contentElement) || readBorderRadius(contentElement)

    glassElement.style.width = `${width}px`
    glassElement.style.height = `${height}px`
    if (target.value) {
      target.value.style.borderRadius = `${radius}px`
    }

    if (supportsLiquidGlassBackdropFilter()) {
      const filter = getLiquidGlassDisplacementFilter({
        height,
        width,
        radius,
        depth,
        strength,
        chromaticAberration,
      })
      glassElement.style.backdropFilter = `blur(${blur / 2}px) url('${filter}') blur(${blur}px) brightness(${brightness}) saturate(${saturate})`
      glassElement.style.removeProperty('-webkit-backdrop-filter')
      return
    }

    glassElement.style.setProperty('-webkit-backdrop-filter', `blur(${Math.max(8, width / 10)}px) saturate(180%)`)
    glassElement.style.removeProperty('backdrop-filter')
  }

  watchEffect((onCleanup) => {
    resizeObserver?.disconnect()
    resizeObserver = undefined

    if (!getEnabled()) {
      return
    }

    const contentElement = getContentElement()
    if (!contentElement)
      return

    redraw()
    resizeObserver = new ResizeObserver(redraw)
    resizeObserver.observe(contentElement)

    onCleanup(() => {
      resizeObserver?.disconnect()
      resizeObserver = undefined
    })
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = undefined
  })

  return {
    redraw,
  }
}
