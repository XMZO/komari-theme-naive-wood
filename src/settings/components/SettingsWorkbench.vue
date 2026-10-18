<script setup lang="ts">
import type { DropdownOption } from 'naive-ui'
import type { SettingField, SettingGroup } from '../schema'
import { useEventListener, useWindowSize } from '@vueuse/core'
import { NButton, NDrawer, NDrawerContent, NDropdown, NEmpty, NInput, NResult, NSpin, useDialog, useMessage } from 'naive-ui'
import { computed, h, nextTick, onMounted, ref } from 'vue'
import { useDraft } from '../context'
import { SETTING_FIELD_MAP, SETTING_GROUPS, THEME_SETTING_DEFAULTS } from '../schema'
import PreviewPane from './PreviewPane.vue'
import SettingRow from './SettingRow.vue'
import SettingSectionCard from './SettingSectionCard.vue'
import TransferModal from './TransferModal.vue'

defineProps<{
  hostDark: boolean
}>()

const draftApi = useDraft()
const { status, errorMessage, saving, sitename, draft, dirtyKeys, dirtyKeySet } = draftApi
const message = useMessage()
const dialog = useDialog()

const version = __BUILD_VERSION__
const activeGroupId = ref(SETTING_GROUPS[0]!.id)
const query = ref('')
const content = ref<HTMLElement | null>(null)
const previewDrawer = ref(false)
const transferMode = ref<'export' | 'import' | null>(null)
const exportText = ref('')

const { width } = useWindowSize()
const showPreviewColumn = computed(() => width.value >= 1280)
const navAsTabs = computed(() => width.value < 820)

const activeGroup = computed(() => SETTING_GROUPS.find(group => group.id === activeGroupId.value) ?? SETTING_GROUPS[0]!)

function groupKeys(group: SettingGroup) {
  return group.sections.flatMap(section => section.keys)
}

const dirtyGroupIds = computed(() => new Set(SETTING_GROUPS
  .filter(group => groupKeys(group).some(key => dirtyKeySet.value.has(key)))
  .map(group => group.id)))

const activeGroupModified = computed(() => groupKeys(activeGroup.value)
  .some(key => !Object.is(draft.value[key], THEME_SETTING_DEFAULTS[key])))

const searchResults = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) {
    return null
  }
  const results: Array<{ group: SettingGroup, field: SettingField }> = []
  for (const group of SETTING_GROUPS) {
    for (const section of group.sections) {
      for (const key of section.keys) {
        const field = SETTING_FIELD_MAP.get(key)
        if (!field || field.hidden) {
          continue
        }
        const haystack = [field.label, field.help, field.key, field.keywords, group.title, section.title]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (haystack.includes(keyword)) {
          results.push({ group, field })
        }
      }
    }
  }
  return results
})

const reloadHint = computed(() => dirtyKeys.value.some(key => SETTING_FIELD_MAP.get(key)?.reloadRequired))

// 编辑卡片或列表分组时，预览切换到对应视图
const previewViewMode = computed(() => {
  if (searchResults.value) {
    return null
  }
  return activeGroup.value.id === 'list' ? 'list' : activeGroup.value.id === 'card' ? 'card' : null
})

function selectGroup(id: string) {
  activeGroupId.value = id
  query.value = ''
  content.value?.scrollTo({ top: 0 })
}

async function save() {
  if (dirtyKeys.value.length === 0 || saving.value) {
    return
  }
  try {
    await draftApi.save()
    message.success('设置已保存，访客刷新页面后生效')
  }
  catch (error) {
    message.error(`保存失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

function discard() {
  dialog.warning({
    title: '撤销全部修改？',
    content: `将放弃 ${dirtyKeys.value.length} 项尚未保存的修改。`,
    positiveText: '撤销修改',
    negativeText: '取消',
    onPositiveClick: () => draftApi.discard(),
  })
}

function resetAll() {
  dialog.warning({
    title: '全部恢复默认？',
    content: '所有设置都会恢复为默认值，保存后才会生效。',
    positiveText: '恢复默认',
    negativeText: '取消',
    onPositiveClick: () => draftApi.resetToDefault(Object.keys(THEME_SETTING_DEFAULTS)),
  })
}

function handleImport(text: string) {
  try {
    const result = draftApi.importSettings(text)
    transferMode.value = null
    const ignored = result.ignored.length > 0 ? `，忽略 ${result.ignored.length} 项` : ''
    message.success(`已导入 ${result.applied} 项到草稿${ignored}，确认后请保存`)
  }
  catch (error) {
    message.error(`导入失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

function menuIcon(icon: string) {
  return () => h('span', { class: icon })
}

const moreOptions: DropdownOption[] = [
  { key: 'import', label: '导入配置', icon: menuIcon('i-icon-park-outline-upload') },
  { key: 'export', label: '导出配置', icon: menuIcon('i-icon-park-outline-download') },
  { type: 'divider', key: 'divider-1' },
  { key: 'site', label: '打开前台', icon: menuIcon('i-icon-park-outline-share') },
  { key: 'reset', label: '全部恢复默认', icon: menuIcon('i-icon-park-outline-return') },
]

function handleMore(key: string) {
  if (key === 'import') {
    transferMode.value = 'import'
  }
  else if (key === 'export') {
    exportText.value = draftApi.exportSettings()
    transferMode.value = 'export'
  }
  else if (key === 'site') {
    window.open('/', '_blank', 'noopener')
  }
  else if (key === 'reset') {
    resetAll()
  }
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
})

useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
  if (dirtyKeys.value.length > 0) {
    event.preventDefault()
  }
})

onMounted(() => {
  void draftApi.load()
})

async function focusField(group: SettingGroup, field: SettingField) {
  selectGroup(group.id)
  await nextTick()
  const element = document.getElementById(`setting-${field.key}`)
  if (!element) {
    return
  }
  element.scrollIntoView({ block: 'center', behavior: 'smooth' })
  element.classList.add('setting-row--flash')
  window.setTimeout(() => element.classList.remove('setting-row--flash'), 1400)
}
</script>

<template>
  <div class="workbench">
    <header class="topbar">
      <div class="topbar__brand">
        <span class="topbar__mark">
          <span class="i-icon-park-outline-platte" />
        </span>
        <div class="topbar__titles">
          <span class="topbar__title">Naive 主题设置</span>
          <span class="topbar__subtitle">v{{ version }}<template v-if="sitename"> · {{ sitename }}</template></span>
        </div>
      </div>

      <NInput
        v-if="status === 'ready'"
        v-model:value="query"
        class="topbar__search"
        clearable
        placeholder="搜索设置"
        round
        size="small"
      >
        <template #prefix>
          <span class="i-icon-park-outline-search topbar__search-icon" />
        </template>
      </NInput>

      <div v-if="status === 'ready'" class="topbar__actions">
        <Transition name="fade">
          <span v-if="dirtyKeys.length > 0" class="topbar__dirty">
            {{ dirtyKeys.length }} 项未保存
          </span>
        </Transition>
        <NButton v-if="dirtyKeys.length > 0" quaternary size="small" @click="discard">
          撤销
        </NButton>
        <NButton v-if="!showPreviewColumn" secondary size="small" @click="previewDrawer = true">
          <template #icon>
            <span class="i-icon-park-outline-preview-open" />
          </template>
          预览
        </NButton>
        <NDropdown :options="moreOptions" placement="bottom-end" trigger="click" @select="handleMore">
          <NButton circle quaternary size="small" title="更多">
            <span class="i-icon-park-outline-more" />
          </NButton>
        </NDropdown>
        <NButton
          :disabled="dirtyKeys.length === 0"
          :loading="saving"
          size="small"
          title="保存（Ctrl / ⌘ + S）"
          type="primary"
          @click="save"
        >
          <template #icon>
            <span class="i-icon-park-outline-save" />
          </template>
          保存
        </NButton>
      </div>
    </header>

    <div v-if="status === 'loading'" class="workbench__state">
      <NSpin size="medium" />
      <span>正在读取设置…</span>
    </div>

    <div v-else-if="status === 'unauthorized'" class="workbench__state">
      <NResult description="请先登录 Komari 后台，再打开主题设置。" status="403" title="需要管理员登录">
        <template #footer>
          <div class="workbench__state-actions">
            <NButton href="/admin" tag="a" target="_blank" type="primary">
              前往登录
            </NButton>
            <NButton @click="draftApi.load()">
              已登录，重试
            </NButton>
          </div>
        </template>
      </NResult>
    </div>

    <div v-else-if="status === 'error'" class="workbench__state">
      <NResult :description="errorMessage" status="error" title="读取设置失败">
        <template #footer>
          <NButton @click="draftApi.load()">
            重试
          </NButton>
        </template>
      </NResult>
    </div>

    <div
      v-else
      class="workbench__body"
      :class="{
        'workbench__body--preview': showPreviewColumn,
        'workbench__body--tabs': navAsTabs,
      }"
    >
      <nav class="nav">
        <button
          v-for="group in SETTING_GROUPS"
          :key="group.id"
          class="nav__item"
          :class="{ 'nav__item--active': !searchResults && group.id === activeGroupId }"
          type="button"
          @click="selectGroup(group.id)"
        >
          <span class="nav__icon" :class="group.icon" />
          <span class="nav__label">{{ group.title }}</span>
          <span v-if="dirtyGroupIds.has(group.id)" class="nav__dirty" title="有未保存的修改" />
        </button>
      </nav>

      <main ref="content" class="content">
        <div class="content__inner">
          <template v-if="searchResults">
            <div class="content__header">
              <div>
                <h2 class="content__title">
                  搜索结果
                </h2>
                <p class="content__description">
                  {{ searchResults.length }} 项匹配「{{ query.trim() }}」
                </p>
              </div>
            </div>
            <div v-if="searchResults.length > 0" class="search-results">
              <div v-for="result in searchResults" :key="result.field.key" class="search-results__item">
                <SettingRow :field="result.field" :group-title="result.group.title" />
                <button class="search-results__locate" type="button" @click="focusField(result.group, result.field)">
                  在「{{ result.group.title }}」中查看
                  <span class="i-icon-park-outline-right" />
                </button>
              </div>
            </div>
            <NEmpty v-else class="content__empty" description="没有找到匹配的设置" />
          </template>

          <template v-else>
            <div class="content__header">
              <div>
                <h2 class="content__title">
                  {{ activeGroup.title }}
                </h2>
                <p class="content__description">
                  {{ activeGroup.description }}
                </p>
              </div>
              <NButton v-if="activeGroupModified" quaternary size="small" @click="draftApi.resetToDefault(groupKeys(activeGroup))">
                <template #icon>
                  <span class="i-icon-park-outline-return" />
                </template>
                恢复本组默认
              </NButton>
            </div>
            <SettingSectionCard v-for="(section, index) in activeGroup.sections" :key="`${activeGroup.id}-${index}`" :section="section" />
          </template>
        </div>
      </main>

      <aside v-if="showPreviewColumn" class="preview-column">
        <PreviewPane :host-dark="hostDark" :reload-hint="reloadHint" :settings="draft" :view-mode="previewViewMode" />
      </aside>
    </div>

    <NDrawer v-if="!showPreviewColumn" v-model:show="previewDrawer" placement="right" :width="Math.min(960, width - 24)">
      <NDrawerContent body-content-style="height: 100%; padding: 12px;" closable>
        <PreviewPane :host-dark="hostDark" :reload-hint="reloadHint" :settings="draft" :view-mode="previewViewMode" />
      </NDrawerContent>
    </NDrawer>

    <TransferModal :export-text="exportText" :mode="transferMode" @close="transferMode = null" @import="handleImport" />
  </div>
</template>

<style scoped lang="scss">
.workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.topbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 16px;
  height: 60px;
  padding: 0 18px;
  border-bottom: 1px solid var(--s-border);
  background: color-mix(in srgb, var(--s-surface) 88%, transparent);
  backdrop-filter: saturate(150%) blur(10px);
}

.topbar__brand {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
}

.topbar__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--s-primary-soft);
  color: var(--s-primary);
  font-size: 15px;
}

.topbar__titles {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.topbar__title {
  font-size: 15px;
  font-weight: 600;
}

.topbar__subtitle {
  max-width: 220px;
  overflow: hidden;
  color: var(--s-text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar__search {
  flex: 1;
  max-width: 320px;
  margin-left: auto;
}

.topbar__search-icon {
  color: var(--s-text-3);
}

.topbar__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}

.topbar__dirty {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--s-primary-soft);
  color: var(--s-primary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.workbench__state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--s-text-3);
}

.workbench__state-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.workbench__body {
  display: grid;
  flex: 1;
  grid-template-columns: 196px minmax(0, 1fr);
  min-height: 0;
}

.workbench__body--preview {
  grid-template-columns: 196px minmax(440px, 1fr) minmax(480px, 1.15fr);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 10px;
  overflow-y: auto;
  border-right: 1px solid var(--s-border);
}

.nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--s-text-2);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--s-hover);
    color: var(--s-text-1);
  }
}

.nav__item--active,
.nav__item--active:hover {
  background: var(--s-primary-soft);
  color: var(--s-primary);
  font-weight: 600;
}

.nav__icon {
  flex-shrink: 0;
  font-size: 16px;
}

.nav__label {
  flex: 1;
  white-space: nowrap;
}

.nav__dirty {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--s-primary);
}

.content {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.content__inner {
  max-width: 780px;
  margin: 0 auto;
  padding: 26px 28px 64px;
}

.content__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.content__title {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.content__description {
  margin: 4px 0 0;
  color: var(--s-text-3);
  font-size: 13px;
}

.content__empty {
  margin-top: 80px;
}

.search-results {
  overflow: hidden;
  border: 1px solid var(--s-border);
  border-radius: 12px;
  background: var(--s-surface);
  box-shadow: var(--s-shadow);
}

.search-results__item + .search-results__item {
  border-top: 1px solid var(--s-border);
}

.search-results__locate {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: -6px 0 10px 18px;
  padding: 0;
  border: none;
  background: none;
  color: var(--s-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.preview-column {
  min-width: 0;
  min-height: 0;
  padding: 16px 16px 16px 0;
}

/* 窄屏：分组导航改为顶部横向标签 */
.workbench__body--tabs {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);

  .nav {
    flex-direction: row;
    gap: 4px;
    padding: 10px 12px;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--s-border);
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .nav__item {
    flex-shrink: 0;
    width: auto;
    height: 34px;
  }

  .content__inner {
    padding: 20px 14px 56px;
  }
}

:deep(.setting-row--flash) {
  animation: setting-flash 1.4s ease;
}

@keyframes setting-flash {
  0%,
  60% {
    background: var(--s-primary-soft);
  }

  100% {
    background: transparent;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .topbar {
    gap: 10px;
    padding: 0 12px;
  }

  .topbar__titles {
    display: none;
  }

  .topbar__dirty {
    display: none;
  }
}
</style>
