<script setup lang="ts">
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { derivePrimaryStates, isHexColor } from '../color'
import { useDraft } from '../context'

const props = defineProps<{
  mode: 'light' | 'dark'
}>()

const { draft, setValue } = useDraft()

const keys = computed(() => ({
  primary: `${props.mode}PrimaryColor`,
  hover: `${props.mode}PrimaryColorHover`,
  pressed: `${props.mode}PrimaryColorPressed`,
}))

const colors = computed(() => ({
  primary: String(draft.value[keys.value.primary] ?? ''),
  hover: String(draft.value[keys.value.hover] ?? ''),
  pressed: String(draft.value[keys.value.pressed] ?? ''),
}))

const canDerive = computed(() => isHexColor(colors.value.primary))

function derive() {
  if (!canDerive.value) {
    return
  }
  const { hover, pressed } = derivePrimaryStates(colors.value.primary)
  setValue(keys.value.hover, hover)
  setValue(keys.value.pressed, pressed)
}

const states = computed(() => [
  { label: '常态', color: colors.value.primary },
  { label: '悬停', color: colors.value.hover },
  { label: '按下', color: colors.value.pressed },
])
</script>

<template>
  <div class="color-tools" :class="`color-tools--${mode}`">
    <div class="color-tools__preview">
      <span
        v-for="state in states"
        :key="state.label"
        class="color-tools__chip"
        :style="{ backgroundColor: state.color }"
      >
        {{ state.label }}
      </span>
    </div>
    <NButton :disabled="!canDerive" secondary size="small" @click="derive">
      <template #icon>
        <span class="i-icon-park-outline-magic" />
      </template>
      根据主色生成悬停色与按下色
    </NButton>
  </div>
</template>

<style scoped lang="scss">
.color-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  grid-column: 1 / -1;
  padding: 12px 14px;
  border-top: 1px solid var(--s-border);
}

.color-tools__preview {
  display: inline-flex;
  gap: 6px;
  padding: 6px;
  border-radius: 10px;
}

.color-tools--light .color-tools__preview {
  background: #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 8%) inset;
}

.color-tools--dark .color-tools__preview {
  background: #18181c;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 10%) inset;
}

.color-tools__chip {
  min-width: 52px;
  padding: 5px 10px;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  text-shadow: 0 1px 1px rgb(0 0 0 / 20%);
}

.color-tools--dark .color-tools__chip {
  color: #101014;
  text-shadow: none;
}
</style>
