<script setup lang="ts">
import type { ListViewColumn } from '../schema'
import { NAlert, NButton, NCheckbox, NInput, NSwitch } from 'naive-ui'
import { computed, ref } from 'vue'
import { useDraft } from '../context'
import { LIST_COLUMN_FALLBACK_WIDTHS, LIST_VIEW_COLUMN_KEYS, LIST_VIEW_COLUMNS } from '../schema'

type ColumnMapKey = 'listColumnWidths' | 'listColumnPadding' | 'listColumnMargin'

const { draft, setValue } = useDraft()

const labels = Object.fromEntries(LIST_VIEW_COLUMNS.map(column => [column.key, column.label])) as Record<ListViewColumn, string>

function parseColumns(text: unknown): ListViewColumn[] | null {
  if (typeof text !== 'string') {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) {
      return null
    }
    const columns = parsed.filter((item): item is ListViewColumn => (LIST_VIEW_COLUMN_KEYS as readonly unknown[]).includes(item))
    return columns.length > 0 ? [...new Set(columns)] : null
  }
  catch {
    return null
  }
}

function parseColumnMap(text: unknown): Record<string, string> | null {
  if (typeof text !== 'string') {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  }
  catch {
    return null
  }
}

const parsedColumns = computed(() => parseColumns(draft.value.listViewColumns))
const parsedMaps = computed(() => ({
  listColumnWidths: parseColumnMap(draft.value.listColumnWidths),
  listColumnPadding: parseColumnMap(draft.value.listColumnPadding),
  listColumnMargin: parseColumnMap(draft.value.listColumnMargin),
}))

// 与前台一致：列配置无效时显示全部列，其余配置无效时视为未设置。
const enabledColumns = computed<ListViewColumn[]>(() => parsedColumns.value ?? [...LIST_VIEW_COLUMN_KEYS])
const columnMaps = computed(() => ({
  listColumnWidths: parsedMaps.value.listColumnWidths ?? {},
  listColumnPadding: parsedMaps.value.listColumnPadding ?? {},
  listColumnMargin: parsedMaps.value.listColumnMargin ?? {},
}))

const hasInvalidConfig = computed(() => parsedColumns.value === null
  || Object.values(parsedMaps.value).includes(null))

const rows = computed(() => [
  ...enabledColumns.value.map(key => ({ key, enabled: true })),
  ...LIST_VIEW_COLUMN_KEYS.filter(key => !enabledColumns.value.includes(key)).map(key => ({ key, enabled: false })),
])

const showSpacing = ref(Object.keys(columnMaps.value.listColumnPadding).length > 0
  || Object.keys(columnMaps.value.listColumnMargin).length > 0)

function writeColumns(columns: ListViewColumn[]) {
  setValue('listViewColumns', JSON.stringify(columns))
}

function toggleColumn(key: ListViewColumn, checked: boolean) {
  if (checked) {
    writeColumns([...enabledColumns.value, key])
    return
  }
  // 前台在列为空时会退回全部列，这里直接禁止取消最后一列。
  if (enabledColumns.value.length > 1) {
    writeColumns(enabledColumns.value.filter(column => column !== key))
  }
}

function moveColumn(key: ListViewColumn, offset: number) {
  const columns = [...enabledColumns.value]
  const index = columns.indexOf(key)
  const target = index + offset
  if (index < 0 || target < 0 || target >= columns.length) {
    return
  }
  columns.splice(index, 1)
  columns.splice(target, 0, key)
  writeColumns(columns)
}

function updateColumnValue(settingKey: ColumnMapKey, column: ListViewColumn, text: string) {
  const next = { ...columnMaps.value[settingKey] }
  // 不在输入时裁剪空格，否则无法输入 minmax(200px, 1fr) 这类值；前台读取时会自行裁剪。
  if (text.trim()) {
    next[column] = text
  }
  else {
    delete next[column]
  }
  setValue(settingKey, JSON.stringify(next))
}
</script>

<template>
  <div class="columns-editor">
    <NAlert v-if="hasInvalidConfig" :bordered="false" size="small" type="warning">
      原有的列配置格式有误，前台正按默认值显示；在这里修改后会写入正确的格式。
    </NAlert>

    <div class="columns-editor__table" :class="{ 'columns-editor__table--spacing': showSpacing }">
      <div class="columns-editor__head">
        <span>列</span>
        <span>宽度</span>
        <template v-if="showSpacing">
          <span>内边距</span>
          <span>外边距</span>
        </template>
        <span class="columns-editor__head-order">顺序</span>
      </div>

      <div
        v-for="row in rows"
        :key="row.key"
        class="columns-editor__row"
        :class="{ 'columns-editor__row--off': !row.enabled }"
      >
        <NCheckbox
          :checked="row.enabled"
          :disabled="row.enabled && enabledColumns.length === 1"
          @update:checked="(checked: boolean) => toggleColumn(row.key, checked)"
        >
          {{ labels[row.key] }}
        </NCheckbox>
        <NInput
          size="tiny"
          :disabled="!row.enabled"
          :placeholder="LIST_COLUMN_FALLBACK_WIDTHS[row.key]"
          :value="columnMaps.listColumnWidths[row.key] ?? ''"
          @update:value="(text: string) => updateColumnValue('listColumnWidths', row.key, text)"
        />
        <template v-if="showSpacing">
          <NInput
            size="tiny"
            :disabled="!row.enabled"
            placeholder="默认"
            :value="columnMaps.listColumnPadding[row.key] ?? ''"
            @update:value="(text: string) => updateColumnValue('listColumnPadding', row.key, text)"
          />
          <NInput
            size="tiny"
            :disabled="!row.enabled"
            placeholder="默认"
            :value="columnMaps.listColumnMargin[row.key] ?? ''"
            @update:value="(text: string) => updateColumnValue('listColumnMargin', row.key, text)"
          />
        </template>
        <div class="columns-editor__order">
          <template v-if="row.enabled">
            <NButton
              :disabled="enabledColumns.indexOf(row.key) === 0"
              quaternary
              size="tiny"
              title="上移"
              @click="moveColumn(row.key, -1)"
            >
              <span class="i-icon-park-outline-up" />
            </NButton>
            <NButton
              :disabled="enabledColumns.indexOf(row.key) === enabledColumns.length - 1"
              quaternary
              size="tiny"
              title="下移"
              @click="moveColumn(row.key, 1)"
            >
              <span class="i-icon-park-outline-down" />
            </NButton>
          </template>
        </div>
      </div>
    </div>

    <div class="columns-editor__footer">
      <label class="columns-editor__toggle">
        <NSwitch v-model:value="showSpacing" size="small" />
        <span>调整内边距与外边距</span>
      </label>
      <span class="columns-editor__hint">宽度支持 px、rem、fr 与 minmax()，留空使用占位中的默认值</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.columns-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.columns-editor__table {
  --columns: minmax(110px, 1fr) minmax(140px, 1.4fr) 64px;

  overflow: hidden;
  border: 1px solid var(--s-border);
  border-radius: 10px;
}

.columns-editor__table--spacing {
  --columns: minmax(100px, 1fr) minmax(130px, 1.2fr) minmax(90px, 0.8fr) minmax(90px, 0.8fr) 64px;
}

.columns-editor__head,
.columns-editor__row {
  display: grid;
  grid-template-columns: var(--columns);
  align-items: center;
  gap: 10px;
  padding: 0 12px;
}

.columns-editor__head {
  height: 32px;
  background: var(--s-subtle);
  color: var(--s-text-3);
  font-size: 12px;
}

.columns-editor__head-order {
  text-align: right;
}

.columns-editor__row {
  min-height: 40px;
  border-top: 1px solid var(--s-border);
  transition: opacity 0.15s ease;
}

.columns-editor__row--off {
  opacity: 0.55;
}

.columns-editor__order {
  display: flex;
  justify-content: flex-end;
}

.columns-editor__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.columns-editor__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.columns-editor__hint {
  color: var(--s-text-3);
  font-size: 12px;
}
</style>
