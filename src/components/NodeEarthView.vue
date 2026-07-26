<script setup lang="ts">
import type { Feature, GeoJsonObject, MultiPolygon } from 'geojson'
import type { Layer } from 'leaflet'
import type { NodeData } from '@/stores/nodes'
import type { MapFeatureProperties } from '@/utils/worldMapData'
import * as L from 'leaflet'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import LiquidGlassSurface from '@/components/LiquidGlassSurface.vue'
import { useAppStore } from '@/stores/app'
import { getRegionCode, getRegionDisplayName, resolveNodeRegion } from '@/utils/regionHelper'
import { worldMapData } from '@/utils/worldMapData'
import 'leaflet/dist/leaflet.css'

type RegionStatus = 'online' | 'offline' | 'partial' | 'inactive'
type CountryFeature = Feature<MultiPolygon, MapFeatureProperties>

const props = defineProps<{
  nodes: NodeData[]
}>()

const emit = defineEmits<{
  click: [node: NodeData]
}>()

const appStore = useAppStore()

const mapElement = ref<HTMLElement | null>(null)
const map = shallowRef<L.Map | null>(null)
const tileLayer = shallowRef<L.TileLayer | null>(null)
const countryLayer = shallowRef<L.GeoJSON | null>(null)
const smallRegionLayer = shallowRef<L.LayerGroup | null>(null)
const mapReady = ref(false)

const hasLiquidGlass = computed(() => appStore.isLiquidGlassScopeEnabled('interface'))

const tileUrl = computed(() => {
  return appStore.isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
})

/**
 * 港澳台在地图上是独立 feature，但节点归属上作为一个整体高亮，
 * 与 regionHelper 中大中华区的处理保持一致。
 */
const chinaRegionCodes = new Set(['CN', 'HK', 'MO', 'TW'])

interface SmallRegionDisplay {
  anchor: [number, number]
  label: [number, number]
}

/**
 * 面积过小、在低缩放级别下不足一个像素的地区，
 * 用引线加圆形标签牵引到旁边空白处显示。
 */
const smallRegionDisplays: Record<string, SmallRegionDisplay> = {
  HK: { anchor: [22.3193, 114.1694], label: [22.85, 116.25] },
  MO: { anchor: [22.1987, 113.5439], label: [21.35, 111.7] },
  MC: { anchor: [43.7384, 7.4246], label: [43.2, 5.4] },
  SG: { anchor: [1.3521, 103.8198], label: [0.9, 108.4] },
  SM: { anchor: [43.9424, 12.4578], label: [43.2, 14.4] },
  VA: { anchor: [41.9029, 12.4534], label: [41.1, 14.1] },
}

function getEffectiveRegion(node: NodeData): string {
  return resolveNodeRegion(node.region, node.tags, appStore.enableNodeFlagOverride)
}

/** 节点按地区二字码分组，是所有着色和交互的唯一数据源。 */
const nodesByRegionCode = computed(() => {
  const groups = new Map<string, NodeData[]>()

  for (const node of props.nodes) {
    const code = getRegionCode(getEffectiveRegion(node))
    if (!code) {
      continue
    }

    const existing = groups.get(code)
    if (existing) {
      existing.push(node)
    }
    else {
      groups.set(code, [node])
    }
  }

  return groups
})

const chinaRegionNodes = computed(() => {
  return props.nodes.filter(node => chinaRegionCodes.has(getRegionCode(getEffectiveRegion(node))))
})

const nodeCounts = computed(() => {
  const online = props.nodes.filter(node => node.online).length
  return {
    online,
    offline: props.nodes.length - online,
    total: props.nodes.length,
  }
})

/**
 * 节点数据变化时只刷新样式，不重建几何图层。
 * 默认 3 秒一次的数据刷新如果全量重建 241 个国家的 GeoJSON，
 * 会造成明显的闪烁和无谓的 CPU 开销。
 */
watch(
  () => props.nodes,
  () => {
    refreshStyles()
  },
  { deep: true },
)

watch(
  () => appStore.isDark,
  () => {
    tileLayer.value?.setUrl(tileUrl.value)
    refreshStyles()
  },
)

watch(
  () => appStore.enableNodeFlagOverride,
  () => {
    refreshStyles()
  },
)

onMounted(async () => {
  await nextTick()
  initMap()
})

onBeforeUnmount(() => {
  destroyMap()
})

function initMap() {
  if (!mapElement.value || map.value)
    return

  const leafletMap = L.map(mapElement.value, {
    attributionControl: false,
    center: [20, 0],
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1,
    maxZoom: 8,
    minZoom: 2,
    preferCanvas: true,
    scrollWheelZoom: true,
    worldCopyJump: false,
    zoom: 2,
    zoomControl: true,
  })

  tileLayer.value = L.tileLayer(tileUrl.value, {
    crossOrigin: true,
    maxZoom: 8,
    minZoom: 2,
    // 底图与国家面均不跨副本重复，避免边界处出现重影。
    noWrap: true,
  }).addTo(leafletMap)

  // 国家几何只构建一次，后续仅通过 setStyle 更新外观。
  countryLayer.value = L.geoJSON(worldMapData as unknown as GeoJsonObject, {
    onEachFeature,
    style: feature => countryStyle(feature as CountryFeature | undefined),
  }).addTo(leafletMap)

  smallRegionLayer.value = L.layerGroup().addTo(leafletMap)

  map.value = leafletMap
  mapReady.value = true
  refreshStyles()

  setTimeout(() => {
    leafletMap.invalidateSize()
  }, 0)
}

function destroyMap() {
  if (map.value) {
    map.value.remove()
    map.value = null
  }
  tileLayer.value = null
  countryLayer.value = null
  smallRegionLayer.value = null
  mapReady.value = false
}

/** 重设国家面样式并重建小地区标注（标注数量少，重建成本可忽略）。 */
function refreshStyles() {
  countryLayer.value?.setStyle(feature => countryStyle(feature as CountryFeature | undefined))

  if (smallRegionLayer.value) {
    smallRegionLayer.value.clearLayers()
    renderSmallRegions(smallRegionLayer.value)
  }
}

/** 取某地区应展示的节点；大中华区各地图 feature 共享同一组节点。 */
function getRegionNodes(code: string): NodeData[] {
  if (!code) {
    return []
  }
  if (chinaRegionCodes.has(code) && chinaRegionNodes.value.length > 0) {
    return chinaRegionNodes.value
  }
  return nodesByRegionCode.value.get(code) ?? []
}

function getRegionLabel(code: string): string {
  return getRegionDisplayName(getEmojiForCode(code), 'zh')
}

/** regionHelper 以 emoji 为主键，这里通过二字码反查用于取显示名。 */
function getEmojiForCode(code: string): string {
  if (code.length !== 2) {
    return code
  }
  const base = 0x1F1E6
  const first = code.charCodeAt(0) - 65
  const second = code.charCodeAt(1) - 65
  if (first < 0 || first > 25 || second < 0 || second > 25) {
    return code
  }
  return String.fromCodePoint(base + first, base + second)
}

function getNodesStatus(nodes: NodeData[]): RegionStatus {
  if (nodes.length === 0)
    return 'inactive'
  const onlineCount = nodes.filter(node => node.online).length
  if (onlineCount === 0)
    return 'offline'
  if (onlineCount === nodes.length)
    return 'online'
  return 'partial'
}

function getStatusColor(status: RegionStatus): string {
  switch (status) {
    case 'online':
      return '#18a058'
    case 'offline':
      return '#d03050'
    case 'partial':
      return '#f0a020'
    case 'inactive':
    default:
      return appStore.isDark ? 'rgba(148, 163, 184, 0.42)' : 'rgba(100, 116, 139, 0.36)'
  }
}

function countryStyle(feature?: CountryFeature): L.PathOptions {
  const code = feature?.properties?.regionCode ?? ''
  const regionNodes = getRegionNodes(code)
  const status = getNodesStatus(regionNodes)
  const color = getStatusColor(status)

  if (status === 'inactive') {
    return {
      color,
      fillColor: 'transparent',
      fillOpacity: 0,
      opacity: appStore.isDark ? 0.42 : 0.5,
      weight: 0.6,
    }
  }

  return {
    color,
    fillColor: color,
    fillOpacity: status === 'offline' ? 0.38 : 0.52,
    opacity: 1,
    weight: 1.8,
  }
}

function onEachFeature(feature: Feature, layer: Layer) {
  const code = (feature as CountryFeature).properties?.regionCode ?? ''
  const pathLayer = layer as L.Path

  layer.on({
    click: () => {
      handleRegionClick(getRegionNodes(code))
    },
    mouseout: () => {
      pathLayer.setStyle(countryStyle(feature as CountryFeature))
    },
    mouseover: () => {
      // 无节点的地区不做悬停反馈，避免误导为可点击。
      if (getRegionNodes(code).length === 0) {
        return
      }
      pathLayer.setStyle({ fillOpacity: 0.72, weight: 2.6 })
      pathLayer.bringToFront()
    },
  })

  // tooltip 内容依赖实时节点状态，用函数形式在每次打开时求值。
  layer.bindTooltip(() => {
    const regionNodes = getRegionNodes(code)
    return regionNodes.length > 0
      ? getTooltipContent(getRegionLabel(code), regionNodes)
      : ''
  }, {
    className: 'earth-tooltip',
    direction: 'top',
    opacity: 1,
    sticky: true,
  })
}

function renderSmallRegions(layerGroup: L.LayerGroup) {
  for (const [code, display] of Object.entries(smallRegionDisplays)) {
    const regionNodes = getRegionNodes(code)
    if (regionNodes.length === 0) {
      continue
    }

    // 小地区标签展示自身节点状态，不跟随大中华区聚合结果。
    const ownNodes = nodesByRegionCode.value.get(code) ?? []
    if (ownNodes.length === 0) {
      continue
    }

    const status = getNodesStatus(ownNodes)
    const color = getStatusColor(status)

    const leader = L.polyline([display.anchor, display.label], {
      color,
      dashArray: '4 4',
      interactive: false,
      opacity: 0.78,
      weight: 1.5,
    })
    layerGroup.addLayer(leader)

    const anchor = L.circleMarker(display.anchor, {
      className: 'earth-small-region-anchor',
      color,
      fillColor: color,
      fillOpacity: 0.92,
      interactive: false,
      opacity: 0.92,
      radius: 2.5,
      weight: 1,
    })
    layerGroup.addLayer(anchor)

    const marker = L.marker(display.label, {
      icon: L.divIcon({
        className: 'earth-small-region-marker',
        html: `<span class="earth-small-region-pill" style="--earth-region-color:${color}">${escapeHtml(code)}</span>`,
        iconAnchor: [14, 14],
        iconSize: [28, 28],
      }),
      keyboard: false,
    })

    marker.bindTooltip(getTooltipContent(getRegionLabel(code), ownNodes), {
      className: 'earth-tooltip',
      direction: 'top',
      offset: [0, -8],
      opacity: 1,
    })

    marker.on({
      click: () => handleRegionClick(ownNodes),
      mouseout: () => {
        marker.getElement()?.classList.remove('earth-small-region-marker--hover')
        leader.setStyle({ opacity: 0.78, weight: 1.5 })
      },
      mouseover: () => {
        marker.getElement()?.classList.add('earth-small-region-marker--hover')
        leader.setStyle({ opacity: 1, weight: 2.2 })
      },
    })

    layerGroup.addLayer(marker)
  }
}

function handleRegionClick(regionNodes: NodeData[]) {
  if (regionNodes.length === 1 && regionNodes[0]) {
    emit('click', regionNodes[0])
  }
}

function getTooltipContent(regionName: string, regionNodes: NodeData[]): string {
  const onlineNodes = regionNodes.filter(node => node.online)
  const offlineNodes = regionNodes.filter(node => !node.online)
  const displayNodes = [...offlineNodes, ...onlineNodes].slice(0, 6)
  const moreCount = regionNodes.length - displayNodes.length

  const nodesHtml = displayNodes.map((node) => {
    const statusText = node.online ? '在线' : '离线'
    const statusClass = node.online ? 'online' : 'offline'

    return `<div class="earth-tooltip-node">
      <span class="earth-tooltip-dot earth-tooltip-dot--${statusClass}"></span>
      <span class="earth-tooltip-name">${escapeHtml(node.name)}</span>
      <span class="earth-tooltip-status earth-tooltip-status--${statusClass}">${statusText}</span>
    </div>`
  }).join('')

  const moreHtml = moreCount > 0
    ? `<div class="earth-tooltip-more">+${moreCount} 个节点</div>`
    : ''

  return `<div class="earth-tooltip-content">
    <div class="earth-tooltip-title">${escapeHtml(regionName)}</div>
    <div class="earth-tooltip-summary">共 ${regionNodes.length} 个，在线 ${onlineNodes.length} 个，离线 ${offlineNodes.length} 个</div>
    <div class="earth-tooltip-list">${nodesHtml}${moreHtml}</div>
  </div>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
</script>

<template>
  <LiquidGlassSurface
    scope="interface"
    class="earth-view-glass"
    :class="{ 'earth-view-glass--enabled': hasLiquidGlass }"
  >
    <div
      class="earth-view"
      :class="[
        { 'earth-view--dark': appStore.isDark },
        appStore.cardMaterialClass,
        appStore.cardMaterialBlurClass,
      ]"
    >
      <div ref="mapElement" class="earth-map" />
      <div v-if="!mapReady" class="earth-loading">
        地图加载中
      </div>
      <div class="earth-stats">
        <div class="earth-stats__title">
          地球视图
        </div>
        <div class="earth-stats__row">
          <span class="earth-dot earth-dot--online" />
          <span>在线 {{ nodeCounts.online }}</span>
        </div>
        <div class="earth-stats__row">
          <span class="earth-dot earth-dot--partial" />
          <span>混合状态</span>
        </div>
        <div class="earth-stats__row">
          <span class="earth-dot earth-dot--offline" />
          <span>离线 {{ nodeCounts.offline }}</span>
        </div>
      </div>
    </div>
  </LiquidGlassSurface>
</template>

<style scoped lang="scss">
.earth-view-glass {
  display: block;
  width: 100%;
}

.earth-view-glass--enabled :deep(.earth-view) {
  background-color: transparent !important;
  border-color: rgba(255, 255, 255, 0.38) !important;
}

html.dark .earth-view-glass--enabled :deep(.earth-view) {
  background-color: transparent !important;
  border-color: rgba(255, 255, 255, 0.18) !important;
}

.earth-view {
  position: relative;
  width: 100%;
  height: min(680px, calc(100vh - 220px));
  min-height: 460px;
  overflow: hidden;
  border: 1px solid var(--n-border-color);
  border-radius: var(--n-border-radius);
  background-color: var(--n-color);
}

.earth-map {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(135deg, #eef6ff 0%, #dbeafe 100%);
}

.earth-view--dark .earth-map {
  background: linear-gradient(135deg, #020617 0%, #111827 100%);
}

.earth-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--n-text-color-2);
  background-color: color-mix(in srgb, var(--n-color) 76%, transparent);
}

.earth-stats {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 500;
  display: flex;
  min-width: 138px;
  flex-direction: column;
  gap: 7px;
  padding: 12px;
  color: rgba(15, 23, 42, 0.88);
  background-color: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: var(--n-border-radius);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(10px) saturate(130%);
  -webkit-backdrop-filter: blur(10px) saturate(130%);
}

.earth-view--dark .earth-stats {
  color: rgba(248, 250, 252, 0.9);
  background-color: rgba(15, 23, 42, 0.78);
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.32);
}

.earth-stats__title {
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.earth-stats__row {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.earth-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
}

.earth-dot--online {
  background-color: #18a058;
}

.earth-dot--partial {
  background-color: #f0a020;
}

.earth-dot--offline {
  background-color: #d03050;
}

:deep(.leaflet-container) {
  color: inherit;
  font-family: inherit;
}

:deep(.earth-small-region-marker) {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
}

:deep(.earth-small-region-pill) {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  color: #fff;
  background-color: var(--earth-region-color);
  border: 2px solid rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.22);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  transition:
    box-shadow 160ms ease,
    transform 160ms ease;
}

:deep(.earth-small-region-marker--hover .earth-small-region-pill) {
  transform: scale(1.12);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.28);
}

.earth-view--dark :deep(.earth-small-region-pill) {
  border-color: rgba(15, 23, 42, 0.94);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.42);
}

:deep(.leaflet-control-zoom) {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: var(--n-border-radius);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

:deep(.leaflet-control-zoom a) {
  color: rgba(15, 23, 42, 0.82);
  background-color: rgba(248, 250, 252, 0.88);
  border-bottom-color: rgba(15, 23, 42, 0.1);
}

:deep(.leaflet-control-zoom a:hover) {
  color: rgba(15, 23, 42, 0.96);
  background-color: rgba(255, 255, 255, 0.96);
}

.earth-view--dark :deep(.leaflet-control-zoom) {
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.34);
}

.earth-view--dark :deep(.leaflet-control-zoom a) {
  color: rgba(248, 250, 252, 0.9);
  background-color: rgba(15, 23, 42, 0.86);
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

.earth-view--dark :deep(.leaflet-control-zoom a:hover) {
  color: #fff;
  background-color: rgba(30, 41, 59, 0.94);
}

:deep(.earth-tooltip) {
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  box-shadow: none;
}

:deep(.earth-tooltip::before) {
  display: none;
}

:deep(.earth-tooltip-content) {
  min-width: 240px;
  max-width: 320px;
  padding: 12px;
  color: rgba(15, 23, 42, 0.92);
  background-color: rgba(248, 250, 252, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: var(--n-border-radius);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
}

.earth-view--dark :deep(.earth-tooltip-content) {
  color: rgba(248, 250, 252, 0.94);
  background-color: rgba(15, 23, 42, 0.92);
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.4);
}

:deep(.earth-tooltip-title) {
  margin-bottom: 5px;
  font-size: 14px;
  font-weight: 700;
}

:deep(.earth-tooltip-summary) {
  margin-bottom: 8px;
  color: rgba(71, 85, 105, 0.88);
  font-size: 12px;
}

.earth-view--dark :deep(.earth-tooltip-summary) {
  color: rgba(203, 213, 225, 0.78);
}

:deep(.earth-tooltip-list) {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 8px;
  border-top: 1px solid rgba(148, 163, 184, 0.24);
}

:deep(.earth-tooltip-node) {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

:deep(.earth-tooltip-dot) {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
}

:deep(.earth-tooltip-dot--online) {
  background-color: #18a058;
}

:deep(.earth-tooltip-dot--offline) {
  background-color: #d03050;
}

:deep(.earth-tooltip-name) {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.earth-tooltip-status) {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
}

:deep(.earth-tooltip-status--online) {
  color: #18a058;
}

:deep(.earth-tooltip-status--offline) {
  color: #d03050;
}

:deep(.earth-tooltip-more) {
  color: rgba(71, 85, 105, 0.82);
  font-size: 12px;
}

.earth-view--dark :deep(.earth-tooltip-more) {
  color: rgba(203, 213, 225, 0.74);
}

@media (max-width: 768px) {
  .earth-view {
    height: min(560px, calc(100vh - 260px));
    min-height: 390px;
  }

  .earth-stats {
    right: 10px;
    bottom: 10px;
    min-width: 124px;
    padding: 10px;
  }
}
</style>
