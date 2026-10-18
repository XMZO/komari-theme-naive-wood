<script setup lang="ts">
import type { SettingGroup } from '../schema'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { useDraft } from '../context'
import { THEME_SETTING_DEFAULTS } from '../schema'
import SettingSectionCard from './SettingSectionCard.vue'

const props = defineProps<{
  group: SettingGroup
}>()

const { draft, resetToDefault } = useDraft()

const keys = computed(() => props.group.sections.flatMap(section => section.keys))
const isModified = computed(() => keys.value.some(key => !Object.is(draft.value[key], THEME_SETTING_DEFAULTS[key])))
</script>

<template>
  <div class="group-view">
    <div class="group-view__header">
      <div>
        <h2 class="group-view__title">
          {{ group.title }}
        </h2>
        <p class="group-view__description">
          {{ group.description }}
        </p>
      </div>
      <NButton v-if="isModified" quaternary size="small" @click="resetToDefault(keys)">
        <template #icon>
          <span class="i-icon-park-outline-return" />
        </template>
        恢复本组默认
      </NButton>
    </div>
    <SettingSectionCard v-for="(section, index) in group.sections" :key="index" :section="section" />
  </div>
</template>

<style scoped lang="scss">
.group-view {
  animation: group-view-in 0.18s ease-out;
}

.group-view__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.group-view__title {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.group-view__description {
  margin: 4px 0 0;
  color: var(--s-text-3);
  font-size: 13px;
}

@keyframes group-view-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .group-view {
    animation: none;
  }
}
</style>
