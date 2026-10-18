<script setup lang="ts">
import type { SettingField } from '../schema'
import { NCheckbox, NInputNumber, NSelect, NSlider } from 'naive-ui'
import { computed } from 'vue'

type NumberField = Extract<SettingField, { type: 'number' }>

const props = defineProps<{
  field: NumberField
  value: number
}>()

const emit = defineEmits<{
  update: [value: number]
}>()

const special = computed(() => props.field.special)
const isSpecial = computed(() => special.value !== undefined && props.value === special.value.value)
// 特殊值启用时，滑块停在可选范围内，取消后回到默认或最小值
const numericValue = computed(() => {
  if (isSpecial.value) {
    const fallback = props.field.default === special.value?.value ? props.field.min : props.field.default
    return Math.min(props.field.max, Math.max(props.field.min, fallback))
  }
  return props.value
})

const compactOptions = computed(() => {
  if (props.field.slider || props.field.max - props.field.min > 10) {
    return null
  }
  const step = props.field.step ?? 1
  const options: Array<{ label: string, value: number }> = []
  if (special.value) {
    options.push({ label: special.value.label, value: special.value.value })
  }
  for (let value = props.field.min; value <= props.field.max; value += step) {
    options.push({ label: String(value), value })
  }
  return options
})

function clamp(value: number) {
  return Math.min(props.field.max, Math.max(props.field.min, value))
}

function update(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return
  }
  emit('update', clamp(value))
}

function toggleSpecial(checked: boolean) {
  if (!special.value) {
    return
  }
  emit('update', checked ? special.value.value : numericValue.value)
}
</script>

<template>
  <NSelect
    v-if="compactOptions"
    class="number-control__select"
    size="small"
    :options="compactOptions"
    :value="value"
    @update:value="(next: number) => emit('update', next)"
  />
  <div v-else class="number-control">
    <NCheckbox
      v-if="special"
      class="number-control__special"
      :checked="isSpecial"
      @update:checked="toggleSpecial"
    >
      {{ special.label }}
    </NCheckbox>
    <NSlider
      v-if="field.slider"
      class="number-control__slider"
      :disabled="isSpecial"
      :max="field.max"
      :min="field.min"
      :step="field.step ?? 1"
      :tooltip="false"
      :value="numericValue"
      @update:value="update"
    />
    <NInputNumber
      class="number-control__input"
      size="small"
      :disabled="isSpecial"
      :max="field.max"
      :min="field.min"
      :show-button="false"
      :step="field.step ?? 1"
      :value="numericValue"
      @update:value="update"
    >
      <template v-if="field.unit" #suffix>
        <span class="number-control__unit">{{ field.unit }}</span>
      </template>
    </NInputNumber>
  </div>
</template>

<style scoped lang="scss">
.number-control {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.number-control__special {
  flex-shrink: 0;
}

.number-control__slider {
  flex: 1;
  min-width: 120px;
}

.number-control__input {
  width: 92px;
  flex-shrink: 0;
}

.number-control__unit {
  color: var(--s-text-3);
  font-size: 12px;
}

.number-control__select {
  width: 100%;
  min-width: 96px;
}
</style>
