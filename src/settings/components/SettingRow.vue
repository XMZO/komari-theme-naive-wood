<script setup lang="ts">
import type { SettingField } from '../schema'
import { NTag } from 'naive-ui'
import { computed } from 'vue'
import { useDraft } from '../context'
import { LIST_COLUMN_SETTING_KEYS, THEME_SETTING_DEFAULTS } from '../schema'
import FieldControl from './FieldControl.vue'

const props = defineProps<{
  field: SettingField
  compact?: boolean
  groupTitle?: string
}>()

const { draft, dirtyKeySet, resetToDefault } = useDraft()

// 列编辑器一并管理宽度与边距，修改状态与恢复默认需要覆盖这几项。
const relatedKeys = computed<readonly string[]>(() => props.field.type === 'listColumns' ? LIST_COLUMN_SETTING_KEYS : [props.field.key])
const isDirty = computed(() => relatedKeys.value.some(key => dirtyKeySet.value.has(key)))
const isModified = computed(() => relatedKeys.value.some(key => !Object.is(draft.value[key], THEME_SETTING_DEFAULTS[key])))
// 搜索结果会列出前置条件未满足的项，标明它当前不生效
const isInactive = computed(() => props.field.visible ? !props.field.visible(draft.value) : false)

const isBlock = computed(() => {
  const field = props.field
  return field.type === 'urlList'
    || field.type === 'markdown'
    || field.type === 'listColumns'
    || field.type === 'font'
    || (field.type === 'select' && field.display === 'cards')
    || (field.type === 'number' && field.slider === true)
})
</script>

<template>
  <div
    :id="`setting-${field.key}`"
    class="setting-row"
    :class="{
      'setting-row--block': isBlock,
      'setting-row--compact': compact,
      'setting-row--dirty': isDirty,
    }"
  >
    <div class="setting-row__info">
      <div class="setting-row__title">
        <span v-if="groupTitle" class="setting-row__group">{{ groupTitle }}</span>
        <span class="setting-row__label">{{ field.label }}</span>
        <span v-if="isDirty" class="setting-row__dirty" title="尚未保存" />
        <NTag v-if="field.reloadRequired" :bordered="false" size="tiny">
          保存后刷新生效
        </NTag>
        <NTag v-if="isInactive" :bordered="false" size="tiny" type="warning">
          当前未生效
        </NTag>
        <button
          v-if="isModified"
          class="setting-row__reset"
          title="恢复为默认值"
          type="button"
          @click="resetToDefault(relatedKeys)"
        >
          <span class="i-icon-park-outline-return" />
          <span v-if="!compact">恢复默认</span>
        </button>
      </div>
      <p v-if="field.help && !compact" class="setting-row__help">
        {{ field.help }}
      </p>
    </div>
    <div class="setting-row__control">
      <FieldControl :field="field" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.setting-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 18px;
  transition: background-color 0.15s ease;

  & + & {
    border-top: 1px solid var(--s-border);
  }

  &::before {
    content: '';
    position: absolute;
    top: 12px;
    bottom: 12px;
    left: 0;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--s-primary);
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  &:hover {
    background: var(--s-hover);
  }
}

.setting-row--dirty::before {
  opacity: 1;
}

.setting-row--block {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.setting-row--compact {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 12px 14px;

  & + & {
    border-top: none;
  }

  &::before {
    top: 10px;
    bottom: 10px;
  }
}

.setting-row__info {
  flex: 1;
  min-width: 0;
}

.setting-row__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-height: 22px;
}

.setting-row__group {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--s-subtle);
  color: var(--s-text-3);
  font-size: 11px;
}

.setting-row__label {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}

.setting-row--compact .setting-row__label {
  color: var(--s-text-2);
  font-size: 12.5px;
}

.setting-row__dirty {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--s-primary);
}

.setting-row__reset {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--s-text-3);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    background-color 0.15s ease;

  &:hover,
  &:focus-visible {
    background: var(--s-subtle);
    color: var(--s-primary);
  }
}

.setting-row:hover .setting-row__reset,
.setting-row__reset:focus-visible {
  opacity: 1;
}

.setting-row__help {
  margin: 3px 0 0;
  color: var(--s-text-3);
  font-size: 12.5px;
  line-height: 1.55;
}

.setting-row__control {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  max-width: 60%;
}

.setting-row--block .setting-row__control,
.setting-row--compact .setting-row__control {
  justify-content: stretch;
  max-width: none;
}

// 整行与网格布局中的控件占满可用宽度
.setting-row--block .setting-row__control > :deep(*),
.setting-row--compact .setting-row__control > :deep(*) {
  flex: 1;
  min-width: 0;
}

@media (hover: none) {
  .setting-row__reset {
    opacity: 1;
  }
}
</style>
