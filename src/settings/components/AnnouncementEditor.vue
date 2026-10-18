<script setup lang="ts">
import type { AlertProps } from 'naive-ui'
import { NAlert, NInput } from 'naive-ui'
import { computed } from 'vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useDraft } from '../context'

const props = defineProps<{
  value: string
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const { draft } = useDraft()

const alertType = computed(() => {
  const type = draft.value.alertType
  return (['default', 'info', 'success', 'warning', 'error'].includes(String(type)) ? type : 'info') as AlertProps['type']
})
const alertTitle = computed(() => String(draft.value.alertTitle ?? '').trim() || undefined)
</script>

<template>
  <div class="announcement-editor">
    <NInput
      :autosize="{ minRows: 3, maxRows: 10 }"
      placeholder="支持 **粗体**、*斜体*、`代码` 和 [链接](https://example.com)"
      type="textarea"
      :value="props.value"
      @update:value="(text: string) => emit('update', text)"
    />
    <div class="announcement-editor__preview">
      <span class="announcement-editor__label">预览</span>
      <NAlert v-if="props.value.trim()" :title="alertTitle" :type="alertType" show-icon>
        <MarkdownRenderer :content="props.value" />
      </NAlert>
      <div v-else class="announcement-editor__empty">
        内容为空时首页不显示公告
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.announcement-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.announcement-editor__preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.announcement-editor__label {
  color: var(--s-text-3);
  font-size: 12px;
}

.announcement-editor__empty {
  padding: 14px;
  border: 1px dashed var(--s-border-strong);
  border-radius: 8px;
  color: var(--s-text-3);
  font-size: 13px;
  text-align: center;
}
</style>
