<script setup lang="ts">
import type { SettingField, SettingSection } from '../schema'
import { computed } from 'vue'
import { useDraft } from '../context'
import { SETTING_FIELD_MAP } from '../schema'
import ByteSample from './ByteSample.vue'
import PrimaryColorTools from './PrimaryColorTools.vue'
import SettingRow from './SettingRow.vue'

const props = defineProps<{
  section: SettingSection
}>()

const { draft } = useDraft()

const fields = computed(() => props.section.keys
  .map(key => SETTING_FIELD_MAP.get(key))
  .filter((field): field is SettingField => field !== undefined && !field.hidden && (field.visible?.(draft.value) ?? true)))

const isGrid = computed(() => props.section.layout === 'grid')
</script>

<template>
  <section v-if="fields.length > 0" class="settings-section">
    <header v-if="section.title || section.description" class="settings-section__header">
      <h3 v-if="section.title" class="settings-section__title">
        {{ section.title }}
      </h3>
      <p v-if="section.description" class="settings-section__description">
        {{ section.description }}
      </p>
    </header>
    <div class="settings-card" :class="{ 'settings-card--grid': isGrid }">
      <SettingRow v-for="field in fields" :key="field.key" :compact="isGrid" :field="field" />
      <PrimaryColorTools v-if="section.extra === 'lightColors'" mode="light" />
      <PrimaryColorTools v-else-if="section.extra === 'darkColors'" mode="dark" />
      <ByteSample v-else-if="section.extra === 'byteSample'" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.settings-section + .settings-section {
  margin-top: 22px;
}

.settings-section__header {
  margin: 0 4px 8px;
}

.settings-section__title {
  margin: 0;
  color: var(--s-text-2);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.settings-section__description {
  margin: 2px 0 0;
  color: var(--s-text-3);
  font-size: 12.5px;
  line-height: 1.5;
}

.settings-card {
  overflow: hidden;
  border: 1px solid var(--s-border);
  border-radius: 12px;
  background: var(--s-surface);
  box-shadow: var(--s-shadow);
}

.settings-card--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}
</style>
