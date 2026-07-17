<script setup lang="ts">
import type { Feature, FeatureCollection, GeoJsonObject } from 'geojson'
import type { Layer } from 'leaflet'
import type { NodeData } from '@/stores/nodes'
import * as L from 'leaflet'
import { feature } from 'topojson-client'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import countriesTopology from 'world-atlas/countries-50m.json'
import LiquidGlassSurface from '@/components/LiquidGlassSurface.vue'
import { useAppStore } from '@/stores/app'
import { getRegionCode, getRegionDisplayName, resolveNodeRegion } from '@/utils/regionHelper'
import 'leaflet/dist/leaflet.css'

type RegionStatus = 'online' | 'offline' | 'partial' | 'inactive'

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

const worldData = feature(
  countriesTopology as never,
  (countriesTopology as unknown as { objects: { countries: never } }).objects.countries,
) as unknown as FeatureCollection

const tileUrl = computed(() => {
  return appStore.isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
})

const regionNameOverrides: Record<string, string> = {
  CN: 'China Mainland',
  HK: 'Hong Kong S.A.R., China',
  MO: 'Macau S.A.R., China',
  TW: 'Taiwan, Province of China',
}

const mapNameAliases: Record<string, string> = {
  'China': 'China Mainland',
  'Hong Kong': 'Hong Kong S.A.R., China',
  'Macao': 'Macau S.A.R., China',
  'Republic of Korea': 'South Korea',
  'Taiwan': 'Taiwan, Province of China',
  'United States of America': 'United States',
}

interface SmallRegionDisplay {
  anchor: [number, number]
  label: [number, number]
}

const smallRegionDisplays: Record<string, SmallRegionDisplay> = {
  HK: { anchor: [22.3193, 114.1694], label: [22.85, 116.25] },
  MO: { anchor: [22.1987, 113.5439], label: [21.35, 111.7] },
  MC: { anchor: [43.7384, 7.4246], label: [43.2, 5.4] },
  SG: { anchor: [1.3521, 103.8198], label: [0.9, 108.4] },
  SM: { anchor: [43.9424, 12.4578], label: [43.2, 14.4] },
  VA: { anchor: [41.9029, 12.4534], label: [41.1, 14.1] },
}

const smallRegionCodes = new Set(Object.keys(smallRegionDisplays))
const chinaRegionCodes = new Set(['CN', 'HK', 'MO', 'TW'])
const chinaRegionNames = new Set(Object.values(regionNameOverrides))

function getEffectiveRegion(node: NodeData): string {
  return resolveNodeRegion(node.region, node.tags, appStore.enableNodeFlagOverride)
}

const groupedNodes = computed(() => {
  const groups = new Map<string, NodeData[]>()

  for (const node of props.nodes) {
    const regionName = getMapRegionName(getEffectiveRegion(node))
    if (!regionName)
      continue

    const regionNodes = groups.get(regionName)
    if (regionNodes) {
      regionNodes.push(node)
    }
    else {
      groups.set(regionName, [node])
    }
  }

  return groups
})

const chinaRegionNodes = computed(() => {
  return props.nodes.filter(node => chinaRegionCodes.has(getRegionCode(getEffectiveRegion(node))))
})

const activeRegionNames = computed(() => {
  const names = new Set(groupedNodes.value.keys())
  if (chinaRegionNodes.value.length > 0) {
    for (const name of chinaRegionNames) {
      names.add(name)
    }
  }
  return names
})

const nodeCounts = computed(() => {
  const online = props.nodes.filter(node => node.online).length
  return {
    online,
    offline: props.nodes.length - online,
    total: props.nodes.length,
  }
})

watch(
  () => props.nodes,
  () => {
    renderLayers()
  },
  { deep: true },
)

watch(
  () => appStore.isDark,
  () => {
    tileLayer.value?.setUrl(tileUrl.value)
    renderLayers()
  },
)

watch(
  () => appStore.enableNodeFlagOverride,
  () => {
    renderLayers()
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
  }).addTo(leafletMap)

  map.value = leafletMap
  mapReady.value = true
  renderLayers()

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

function renderLayers() {
  if (!map.value)
    return

  const leafletMap = map.value

  if (countryLayer.value) {
    countryLayer.value.remove()
    countryLayer.value = null
  }

  if (smallRegionLayer.value) {
    smallRegionLayer.value.remove()
    smallRegionLayer.value = null
  }

  countryLayer.value = L.geoJSON(worldData as GeoJsonObject, {
    onEachFeature,
    style: countryStyle,
  }).addTo(leafletMap)

  smallRegionLayer.value = L.layerGroup()
  renderSmallRegions(smallRegionLayer.value)
  smallRegionLayer.value.addTo(leafletMap)
}

function getMapRegionName(region: string): string {
  const code = getRegionCode(region)
  if (regionNameOverrides[code])
    return regionNameOverrides[code]
  return getRegionDisplayName(region, 'en')
}

function getFeatureName(feature: Feature | undefined): string {
  const rawName = feature?.properties?.name
  if (typeof rawName !== 'string')
    return ''
  return mapNameAliases[rawName] ?? rawName
}

function getRegionStatus(regionName: string): RegionStatus {
  if (chinaRegionNames.has(regionName) && chinaRegionNodes.value.length > 0) {
    return getNodesStatus(chinaRegionNodes.value)
  }

  const nodes = groupedNodes.value.get(regionName)
  return getNodesStatus(nodes ?? [])
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

function countryStyle(feature?: Feature): L.PathOptions {
  const regionName = getFeatureName(feature)
  const isActive = activeRegionNames.value.has(regionName)
  const status = isActive ? getRegionStatus(regionName) : 'inactive'
  const color = getStatusColor(status)

  if (!isActive) {
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
  const regionName = getFeatureName(feature)
  const regionNodes = getDisplayRegionNodes(regionName)
  if (!regionNodes || regionNodes.length === 0)
    return

  const pathLayer = layer as L.Path
  layer.bindTooltip(getTooltipContent(regionName, regionNodes), {
    className: 'earth-tooltip',
    direction: 'top',
    opacity: 1,
    sticky: true,
  })

  layer.on({
    click: () => handleRegionClick(regionNodes),
    mouseout: () => {
      pathLayer.setStyle(countryStyle(feature))
    },
    mouseover: () => {
      pathLayer.setStyle({
        fillOpacity: 0.72,
        weight: 2.6,
      })
      pathLayer.bringToFront()
    },
  })
}

function renderSmallRegions(layerGroup: L.LayerGroup) {
  for (const regionName of activeRegionNames.value) {
    const regionNodes = getDisplayRegionNodes(regionName)
    if (!regionNodes || regionNodes.length === 0)
      continue

    const firstNode = regionNodes[0]
    if (!firstNode)
      continue

    const code = getRegionCodeByMapName(regionName) ?? getRegionCode(getEffectiveRegion(firstNode))
    const display = smallRegionDisplays[code]
    if (!display || !smallRegionCodes.has(code))
      continue

    const status = getRegionStatus(regionName)
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

    marker.bindTooltip(getTooltipContent(regionName, regionNodes), {
      className: 'earth-tooltip',
      direction: 'top',
      offset: [0, -8],
      opacity: 1,
    })

    marker.on({
      click: () => handleRegionClick(regionNodes),
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

function getDisplayRegionNodes(regionName: string): NodeData[] {
  if (chinaRegionNames.has(regionName) && chinaRegionNodes.value.length > 0) {
    return chinaRegionNodes.value
  }
  return groupedNodes.value.get(regionName) ?? []
}

function getRegionCodeByMapName(regionName: string): string | undefined {
  for (const [code, name] of Object.entries(regionNameOverrides)) {
    if (name === regionName)
      return code
  }
  return undefined
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
