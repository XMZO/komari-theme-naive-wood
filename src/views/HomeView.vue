<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { NAlert, NButton, NDivider, NDrawer, NDrawerContent, NEmpty, NInput, NTabPane, NTabs } from 'naive-ui'
import { computed, defineAsyncComponent, nextTick, onActivated, onDeactivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import LiquidGlassSurface from '@/components/LiquidGlassSurface.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { isRegionMatch } from '@/utils/regionHelper'

// 定义组件名称，用于 KeepAlive 匹配
defineOptions({
  name: 'HomeView',
})

// 异步组件：按需加载，减少首屏体积
const NodeCard = defineAsyncComponent(() => import('@/components/NodeCard.vue'))
const NodeEarthView = defineAsyncComponent(() => import('@/components/NodeEarthView.vue'))
const NodeGeneralCards = defineAsyncComponent(() => import('@/components/NodeGeneralCards.vue'))
const NodeList = defineAsyncComponent(() => import('@/components/NodeList.vue'))
const RenewalStats = defineAsyncComponent(() => import('@/components/RenewalStats.vue'))

const appStore = useAppStore()
const nodesStore = useNodesStore()

const router = useRouter()

// 组件激活时恢复滚动位置
onActivated(() => {
  if (appStore.homeScrollPosition > 0) {
    // 使用 nextTick 确保 DOM 已渲染完成后再恢复滚动
    nextTick(() => {
      window.scrollTo({ top: appStore.homeScrollPosition, behavior: 'instant' })
    })
  }
})

// 组件失活时保存滚动位置
onDeactivated(() => {
  appStore.homeScrollPosition = window.scrollY
})

const searchText = ref('')
const showRenewalDrawer = ref(false)
// 防抖后的搜索文本
const debouncedSearchText = ref('')

// 使用 VueUse 的 useDebounceFn 进行防抖，300ms 延迟
const updateDebouncedSearch = useDebounceFn((value: string) => {
  debouncedSearchText.value = value
}, 300)

// 监听原始搜索文本变化
watch(searchText, (value) => {
  updateDebouncedSearch(value)
})

const groups = computed(() => {
  return [
    {
      tab: '全部节点',
      name: 'all',
    },
    ...nodesStore.groups.map(group => ({
      tab: group,
      name: group,
    })),
  ]
})

// 计算是否应该显示分组 Tab
const showGroupTabs = computed(() => {
  // 如果配置为单分组时隐藏，且只有一个分组（不含"全部节点"），则隐藏
  if (appStore.hideSingleGroupTab && nodesStore.groups.length <= 1) {
    return false
  }
  return true
})

// 验证当前选中的分组是否有效，无效则重置为 'all'
watch(
  () => nodesStore.groups,
  (groups) => {
    const currentGroup = appStore.nodeSelectedGroup
    if (currentGroup !== 'all' && !groups.includes(currentGroup)) {
      appStore.nodeSelectedGroup = 'all'
    }
  },
  { immediate: true },
)

/**
 * 检查节点是否匹配搜索词
 */
function isNodeMatchSearch(node: typeof nodesStore.nodes[number], search: string): boolean {
  if (!search.trim())
    return true

  const lowerSearch = search.toLowerCase().trim()

  // 搜索节点名称
  if (node.name.toLowerCase().includes(lowerSearch))
    return true

  // 搜索地区（使用 regionHelper 支持国家名称搜索）
  if (node.region && isRegionMatch(node.region, search))
    return true

  // 搜索操作系统
  if (node.os && node.os.toLowerCase().includes(lowerSearch))
    return true

  // 搜索分组
  if (node.group && node.group.toLowerCase().includes(lowerSearch))
    return true

  // 搜索标签
  if (node.tags && node.tags.toLowerCase().includes(lowerSearch))
    return true

  // 搜索备注
  if (node.remark && node.remark.toLowerCase().includes(lowerSearch))
    return true

  return false
}

const nodeList = computed(() => {
  // 先按分组筛选
  let filteredNodes = appStore.nodeSelectedGroup === 'all'
    ? nodesStore.nodes
    : nodesStore.nodes.filter(node => node.group === appStore.nodeSelectedGroup)

  // 再按防抖后的搜索词筛选
  if (debouncedSearchText.value.trim()) {
    filteredNodes = filteredNodes.filter(node => isNodeMatchSearch(node, debouncedSearchText.value))
  }

  if (appStore.offlineNodesLast) {
    filteredNodes = [...filteredNodes].sort((a, b) => {
      if (a.online === b.online)
        return 0
      return a.online ? -1 : 1
    })
  }

  return filteredNodes
})

const canUseRenewalStats = computed(() => {
  return appStore.showRenewalStats
    && nodesStore.nodes.length > 0
    && (appStore.isLoggedIn || appStore.allowGuestRenewalStats)
})

function getNodeDetailLocation(node: typeof nodesStore.nodes[number]) {
  return { name: 'instance-detail' as const, params: { id: node.uuid } }
}

function handleNodeClick(node: typeof nodesStore.nodes[number]) {
  if (appStore.openNodeInNewTab) {
    const href = router.resolve(getNodeDetailLocation(node)).href
    window.open(href, '_blank', 'noopener,noreferrer')
    return
  }

  router.push(getNodeDetailLocation(node))
}

function openRenewalStats() {
  if (!canUseRenewalStats.value) {
    showRenewalDrawer.value = false
    return
  }

  showRenewalDrawer.value = true
}

watch(canUseRenewalStats, (allowed) => {
  if (!allowed) {
    showRenewalDrawer.value = false
  }
})

const hasLiquidGlass = computed(() => appStore.isLiquidGlassScopeEnabled('interface'))
</script>

<template>
  <div class="home-view">
    <div v-if="appStore.connectionError" class="alert px-4">
      <NAlert type="error" title="RPC 服务错误" show-icon>
        连接服务器失败，请检查网络设置或刷新页面后再试。
      </NAlert>
    </div>
    <!-- 自定义公告 -->
    <div v-if="appStore.alertEnabled && appStore.alertContent" class="alert px-4">
      <NAlert :type="appStore.alertType" :title="appStore.alertTitle || undefined" show-icon>
        <MarkdownRenderer :content="appStore.alertContent" />
      </NAlert>
    </div>
    <NodeGeneralCards />
    <NDivider class="my-0! px-4!" dashed />
    <div class="node-info p-4 flex flex-col gap-4">
      <div class="search flex gap-2 items-center">
        <LiquidGlassSurface scope="interface" class="search-glass" :class="{ 'search-glass--enabled': hasLiquidGlass }">
          <NInput
            v-model:value="searchText"
            placeholder="搜索节点名称、地区、系统"
            :class="[appStore.cardMaterialClass, appStore.cardMaterialBlurClass]"
          >
            <template #prefix>
              <div class="i-icon-park-outline-search" />
            </template>
          </NInput>
        </LiquidGlassSurface>
        <NButton
          v-if="canUseRenewalStats"
          class="renewal-trigger"
          :class="[appStore.cardMaterialClass, appStore.cardMaterialBlurClass]"
          title="续费统计"
          text
          @click="openRenewalStats"
        >
          <AppIcon name="renewal" class="toolbar-icon" />
        </NButton>
        <div class="view-selector" :class="[appStore.cardMaterialClass, appStore.cardMaterialBlurClass]" role="radiogroup">
          <NButton
            class="view-selector-item"
            :class="{ 'view-selector-item--active': appStore.nodeViewMode === 'card' }"
            :aria-pressed="appStore.nodeViewMode === 'card'"
            title="卡片视图"
            text
            @click="appStore.nodeViewMode = 'card'"
          >
            <AppIcon name="view-grid-card" class="view-selector-icon" />
          </NButton>
          <NButton
            class="view-selector-item"
            :class="{ 'view-selector-item--active': appStore.nodeViewMode === 'list' }"
            :aria-pressed="appStore.nodeViewMode === 'list'"
            title="列表视图"
            text
            @click="appStore.nodeViewMode = 'list'"
          >
            <AppIcon name="view-list" class="view-selector-icon" />
          </NButton>
          <NButton
            v-if="appStore.enableEarthView"
            class="view-selector-item"
            :class="{ 'view-selector-item--active': appStore.nodeViewMode === 'earth' }"
            :aria-pressed="appStore.nodeViewMode === 'earth'"
            title="地球视图"
            text
            @click="appStore.nodeViewMode = 'earth'"
          >
            <AppIcon name="view-earth" class="view-selector-icon" />
          </NButton>
        </div>
      </div>
      <div class="nodes">
        <NTabs v-if="showGroupTabs" v-model:value="appStore.nodeSelectedGroup" animated>
          <NTabPane v-for="group in groups" :key="group.name" :tab="group.tab" :name="group.name">
            <!-- Card 视图 -->
            <div v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'" class="gap-4 grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
              <NodeCard
                v-for="node in nodeList"
                :key="node.uuid"
                :node="node"
                :detail-to="appStore.useNodeDetailLink ? getNodeDetailLocation(node) : undefined"
                :open-in-new-tab="appStore.openNodeInNewTab"
                @click="handleNodeClick(node)"
              />
            </div>
            <!-- List 视图 -->
            <NodeList
              v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'"
              :nodes="nodeList"
              :use-detail-link="appStore.useNodeDetailLink"
              :open-in-new-tab="appStore.openNodeInNewTab"
              @click="handleNodeClick"
            />
            <!-- Earth 视图 -->
            <NodeEarthView v-else-if="nodeList.length !== 0 && appStore.enableEarthView && appStore.nodeViewMode === 'earth'" :nodes="nodeList" @click="handleNodeClick" />
            <!-- 空状态 -->
            <div v-else class="text-gray-500 text-center">
              <NEmpty description="暂无节点" />
            </div>
          </NTabPane>
        </NTabs>
        <!-- 无分组时直接显示节点列表 -->
        <template v-else>
          <!-- Card 视图 -->
          <div v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'" class="gap-4 grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
            <NodeCard
              v-for="node in nodeList"
              :key="node.uuid"
              :node="node"
              :detail-to="appStore.useNodeDetailLink ? getNodeDetailLocation(node) : undefined"
              :open-in-new-tab="appStore.openNodeInNewTab"
              @click="handleNodeClick(node)"
            />
          </div>
          <!-- List 视图 -->
          <NodeList
            v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'"
            :nodes="nodeList"
            :use-detail-link="appStore.useNodeDetailLink"
            :open-in-new-tab="appStore.openNodeInNewTab"
            @click="handleNodeClick"
          />
          <!-- Earth 视图 -->
          <NodeEarthView v-else-if="nodeList.length !== 0 && appStore.enableEarthView && appStore.nodeViewMode === 'earth'" :nodes="nodeList" @click="handleNodeClick" />
          <!-- 空状态 -->
          <div v-else class="text-gray-500 text-center">
            <NEmpty description="暂无节点" />
          </div>
        </template>
      </div>
    </div>
    <NDrawer v-if="canUseRenewalStats" v-model:show="showRenewalDrawer" :width="720" placement="right">
      <NDrawerContent title="续费统计" closable>
        <RenewalStats :nodes="nodesStore.nodes" embedded />
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped lang="scss">
.search-glass {
  display: block;
  flex: 1;
  min-width: 0;
}

.search-glass--enabled :deep(.n-input) {
  background-color: transparent !important;
  border-color: rgba(255, 255, 255, 0.38) !important;
}

html.dark .search-glass--enabled :deep(.n-input) {
  background-color: transparent !important;
  border-color: rgba(255, 255, 255, 0.18) !important;
}

.renewal-trigger {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  color: rgba(15, 23, 42, 0.74) !important;
  background-color: var(--n-color, rgba(248, 250, 252, 0.72)) !important;
  border: 1px solid var(--n-border-color, rgba(255, 255, 255, 0.52)) !important;
  border-radius: var(--n-border-radius) !important;
}

.renewal-trigger:hover {
  color: rgba(15, 23, 42, 0.98) !important;
  background-color: rgba(248, 250, 252, 0.86) !important;
}

.renewal-trigger :deep(.n-button__content) {
  color: inherit !important;
}

.toolbar-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: inherit !important;
}

.view-selector {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
  padding: 2px;
  overflow: hidden;
  background-color: var(--n-color, rgba(248, 250, 252, 0.72));
  border: 1px solid var(--n-border-color, rgba(255, 255, 255, 0.52));
  border-radius: var(--n-border-radius);
}

.view-selector-item {
  width: 32px;
  height: 32px;
  color: rgba(15, 23, 42, 0.72) !important;
  background-color: transparent !important;
  border: 0 !important;
  border-radius: calc(var(--n-border-radius) - 1px) !important;
}

.view-selector-item:hover {
  color: rgba(15, 23, 42, 0.96) !important;
  background-color: rgba(15, 23, 42, 0.08) !important;
}

.view-selector-item--active {
  color: var(--primary-color) !important;
  background-color: color-mix(in srgb, var(--primary-color) 16%, transparent) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 34%, transparent);
}

.view-selector-item :deep(.n-button__content) {
  color: inherit !important;
}

.view-selector-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: inherit !important;
}

html.dark .view-selector-item {
  color: rgba(248, 250, 252, 0.76) !important;
}

html.dark .renewal-trigger {
  color: rgba(248, 250, 252, 0.78) !important;
  background-color: var(--n-color, rgba(17, 24, 39, 0.72)) !important;
  border-color: var(--n-border-color, rgba(255, 255, 255, 0.13)) !important;
}

html.dark .view-selector {
  background-color: var(--n-color, rgba(17, 24, 39, 0.72));
  border-color: var(--n-border-color, rgba(255, 255, 255, 0.13));
}

html.dark .renewal-trigger:hover {
  color: rgba(248, 250, 252, 0.98) !important;
  background-color: rgba(30, 41, 59, 0.86) !important;
}

html.dark .view-selector-item:hover {
  color: rgba(248, 250, 252, 0.98) !important;
  background-color: rgba(248, 250, 252, 0.08) !important;
}

html.dark .view-selector-item--active {
  color: var(--primary-color) !important;
  background-color: color-mix(in srgb, var(--primary-color) 20%, transparent) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 42%, transparent);
}
</style>
