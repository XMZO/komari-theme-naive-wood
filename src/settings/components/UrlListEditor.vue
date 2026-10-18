<script setup lang="ts">
import { NButton, NInput, NTag } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { isAdaptiveBackgroundUrl, parseBackgroundUrls } from '@/utils/backgroundImageProxy'

const props = defineProps<{
  value: string
  mediaType: string
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const PRESETS = [
  { label: 'alcy 二次元', url: 'https://t.alcy.cc/ycy/' },
  { label: 'yppp 二次元', url: 'https://api.yppp.net/api.php' },
]

// 行内容单独维护，才能保留刚添加、尚未填写的空行；存储时仍按换行拼接，与旧版格式兼容。
const rows = ref<string[]>(parseBackgroundUrls(props.value))

function serialize(list: string[]) {
  return list.map(item => item.trim()).filter(Boolean).join('\n')
}

watch(() => props.value, (value) => {
  if (value !== serialize(rows.value)) {
    rows.value = parseBackgroundUrls(value)
  }
})

function commit() {
  emit('update', serialize(rows.value))
}

function updateRow(index: number, text: string) {
  rows.value[index] = text
  commit()
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
  commit()
}

function moveRow(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= rows.value.length) {
    return
  }
  const [item] = rows.value.splice(index, 1)
  rows.value.splice(target, 0, item!)
  commit()
}

function addRow(url = '') {
  rows.value.push(url)
  if (url) {
    commit()
  }
}

const availablePresets = computed(() => {
  if (props.mediaType !== 'image') {
    return []
  }
  const existing = new Set(rows.value.map(item => item.trim()))
  return PRESETS.filter(preset => !existing.has(preset.url))
})

function rowStatus(text: string): 'adaptive' | 'invalid' | null {
  const value = text.trim()
  if (!value) {
    return null
  }
  if (!/^https?:\/\//i.test(value) && !value.startsWith('/')) {
    return 'invalid'
  }
  return isAdaptiveBackgroundUrl(value) ? 'adaptive' : null
}
</script>

<template>
  <div class="url-list">
    <div v-for="(row, index) in rows" :key="index" class="url-list__row">
      <span class="url-list__index">{{ index + 1 }}</span>
      <NInput
        size="small"
        :placeholder="mediaType === 'video' ? 'https://example.com/background.mp4' : 'https://example.com/background.jpg'"
        :status="rowStatus(row) === 'invalid' ? 'warning' : undefined"
        :value="row"
        @update:value="(text: string) => updateRow(index, text)"
      >
        <template v-if="rowStatus(row) === 'adaptive'" #suffix>
          <NTag :bordered="false" round size="tiny" type="success">
            自动横竖
          </NTag>
        </template>
      </NInput>
      <div class="url-list__actions">
        <NButton :disabled="index === 0" quaternary size="tiny" title="上移" @click="moveRow(index, -1)">
          <span class="i-icon-park-outline-up" />
        </NButton>
        <NButton :disabled="index === rows.length - 1" quaternary size="tiny" title="下移" @click="moveRow(index, 1)">
          <span class="i-icon-park-outline-down" />
        </NButton>
        <NButton quaternary size="tiny" title="删除" type="error" @click="removeRow(index)">
          <span class="i-icon-park-outline-delete" />
        </NButton>
      </div>
    </div>

    <div v-if="rows.length === 0" class="url-list__empty">
      还没有添加地址
    </div>

    <div class="url-list__footer">
      <NButton dashed size="small" @click="addRow()">
        <template #icon>
          <span class="i-icon-park-outline-plus" />
        </template>
        添加地址
      </NButton>
      <NButton v-for="preset in availablePresets" :key="preset.url" quaternary size="small" @click="addRow(preset.url)">
        <template #icon>
          <span class="i-icon-park-outline-plus" />
        </template>
        {{ preset.label }}
      </NButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.url-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.url-list__row {
  display: flex;
  align-items: center;
  gap: 8px;

  :deep(.n-input) {
    flex: 1;
    min-width: 0;
  }
}

.url-list__index {
  flex-shrink: 0;
  width: 20px;
  color: var(--s-text-3);
  font-size: 12px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.url-list__actions {
  display: flex;
  flex-shrink: 0;
}

.url-list__empty {
  padding: 14px;
  border: 1px dashed var(--s-border-strong);
  border-radius: 8px;
  color: var(--s-text-3);
  font-size: 13px;
  text-align: center;
}

.url-list__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}
</style>
