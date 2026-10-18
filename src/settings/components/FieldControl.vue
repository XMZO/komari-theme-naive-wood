<script setup lang="ts">
import type { SettingField, SettingValue } from '../schema'
import { NColorPicker, NInput, NRadioButton, NRadioGroup, NSelect, NSwitch } from 'naive-ui'
import { computed } from 'vue'
import { useDraft } from '../context'
import AnnouncementEditor from './AnnouncementEditor.vue'
import ListColumnsEditor from './ListColumnsEditor.vue'
import NumberControl from './NumberControl.vue'
import UrlListEditor from './UrlListEditor.vue'

const props = defineProps<{
  field: SettingField
}>()

const { draft, setValue } = useDraft()

const value = computed(() => draft.value[props.field.key])
const stringValue = computed(() => String(value.value ?? ''))

function update(next: SettingValue) {
  setValue(props.field.key, next)
}

const CSS_LENGTH = /^(?:0|-?(?:\d+|\d*\.\d+)(?:px|rem|em|%|vw|vh|vmin|vmax|ch))$/i
const COLOR_SWATCHES = ['#18a058', '#2080f0', '#8a2be2', '#f0a020', '#d03050', '#00a2ae', '#63e2b6', '#70c0e8', '#e88080', '#f2c97d']

const textStatus = computed<'warning' | undefined>(() => {
  const field = props.field
  if (field.type !== 'text') {
    return undefined
  }
  const text = stringValue.value.trim()
  if (!text) {
    return field.allowEmpty ? undefined : 'warning'
  }
  if (field.format === 'cssLength' && !CSS_LENGTH.test(text)) {
    return 'warning'
  }
  if (field.format === 'url' && !/^https?:\/\//i.test(text)) {
    return 'warning'
  }
  return undefined
})

const textWarning = computed(() => {
  if (!textStatus.value || props.field.type !== 'text') {
    return ''
  }
  if (!stringValue.value.trim()) {
    return '留空会使用前台的内置值'
  }
  return props.field.format === 'url' ? '链接通常以 http:// 或 https:// 开头' : '看起来不是有效的 CSS 长度，例如 12px、1rem'
})

const selectOptions = computed(() => {
  if (props.field.type !== 'select') {
    return []
  }
  return props.field.options.map(option => ({
    ...option,
    isDisabled: option.disabled?.(draft.value) ?? false,
  }))
})
</script>

<template>
  <NSwitch
    v-if="field.type === 'switch'"
    :value="value === true"
    @update:value="update"
  />

  <NumberControl
    v-else-if="field.type === 'number'"
    :field="field"
    :value="Number(value)"
    @update="update"
  />

  <template v-else-if="field.type === 'select'">
    <div v-if="field.display === 'cards'" class="option-cards">
      <button
        v-for="option in selectOptions"
        :key="option.value"
        class="option-card"
        :class="{ 'option-card--active': value === option.value }"
        :disabled="option.isDisabled"
        type="button"
        @click="update(option.value)"
      >
        <span class="option-card__label">{{ option.label }}</span>
        <span v-if="option.description" class="option-card__description">{{ option.description }}</span>
      </button>
    </div>
    <NRadioGroup
      v-else-if="field.display === 'segmented'"
      size="small"
      :value="value"
      @update:value="update"
    >
      <NRadioButton
        v-for="option in selectOptions"
        :key="option.value"
        :disabled="option.isDisabled"
        :label="option.label"
        :value="option.value"
      />
    </NRadioGroup>
    <NSelect
      v-else
      size="small"
      :options="selectOptions.map(option => ({ label: option.label, value: option.value, disabled: option.isDisabled }))"
      :value="stringValue"
      @update:value="update"
    />
  </template>

  <div v-else-if="field.type === 'text'" class="text-control">
    <NInput
      size="small"
      :clearable="field.allowEmpty"
      :placeholder="field.placeholder"
      :status="textStatus"
      :value="stringValue"
      @update:value="update"
    />
    <span v-if="textWarning" class="text-control__warning">{{ textWarning }}</span>
  </div>

  <NColorPicker
    v-else-if="field.type === 'color'"
    :modes="['hex']"
    :show-alpha="false"
    size="small"
    :swatches="COLOR_SWATCHES"
    :value="stringValue"
    @update:value="update"
  />

  <div v-else-if="field.type === 'font'" class="font-control">
    <NInput size="small" :value="stringValue" @update:value="update" />
    <div class="font-control__sample" :style="{ fontFamily: stringValue }">
      {{ field.sample }}
    </div>
  </div>

  <AnnouncementEditor
    v-else-if="field.type === 'markdown'"
    :value="stringValue"
    @update="update"
  />

  <UrlListEditor
    v-else-if="field.type === 'urlList'"
    :media-type="String(draft.backgroundType)"
    :value="stringValue"
    @update="update"
  />

  <ListColumnsEditor v-else-if="field.type === 'listColumns'" />
</template>

<style scoped lang="scss">
.option-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  width: 100%;
}

.option-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--s-border-strong);
  border-radius: 10px;
  background: var(--s-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover:not(:disabled) {
    border-color: var(--s-primary);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.option-card--active {
  border-color: var(--s-primary);
  background: var(--s-primary-soft);
  box-shadow: 0 0 0 1px var(--s-primary) inset;
}

.option-card__label {
  font-size: 13px;
  font-weight: 600;
}

.option-card__description {
  color: var(--s-text-3);
  font-size: 12px;
  line-height: 1.45;
}

.text-control {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.text-control__warning {
  color: var(--s-warning);
  font-size: 12px;
}

.font-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.font-control__sample {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--s-subtle);
  font-size: 18px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
</style>
