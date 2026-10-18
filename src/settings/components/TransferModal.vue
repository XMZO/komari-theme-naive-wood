<script setup lang="ts">
import { NButton, NInput, NModal, useMessage } from 'naive-ui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  mode: 'export' | 'import' | null
  exportText: string
}>()

const emit = defineEmits<{
  close: []
  import: [text: string]
}>()

const message = useMessage()
const importText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const show = computed(() => props.mode !== null)
const title = computed(() => props.mode === 'export' ? '导出配置' : '导入配置')

watch(() => props.mode, (mode) => {
  if (mode === 'import') {
    importText.value = ''
  }
})

async function copy() {
  try {
    await navigator.clipboard.writeText(props.exportText)
    message.success('已复制到剪贴板')
  }
  catch {
    message.warning('浏览器不允许直接复制，请手动全选复制')
  }
}

function download() {
  const fileName = `naive-settings-${new Date().toISOString().slice(0, 10)}.json`
  const url = URL.createObjectURL(new Blob([props.exportText], { type: 'application/json' }))
  // 设置页位于禁止下载的沙箱 iframe 中，借同源的后台页面发起下载。
  let targetDocument = document
  try {
    if (window.parent !== window && window.parent.document.body) {
      targetDocument = window.parent.document
    }
  }
  catch {
    // 父页面不可访问时在当前页面尝试
  }
  const link = targetDocument.createElement('a')
  link.href = url
  link.download = fileName
  targetDocument.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function chooseFile() {
  fileInput.value?.click()
}

async function readFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  importText.value = await file.text()
}

function submitImport() {
  if (!importText.value.trim()) {
    message.warning('请先粘贴配置或选择文件')
    return
  }
  emit('import', importText.value)
}
</script>

<template>
  <NModal
    :show="show"
    :title="title"
    class="transfer-modal"
    preset="card"
    :segmented="{ content: true, footer: 'soft' }"
    style="width: min(640px, calc(100vw - 32px))"
    @update:show="(value: boolean) => !value && emit('close')"
  >
    <template v-if="mode === 'export'">
      <p class="transfer-modal__tip">
        包含当前编辑中的全部设置（含未保存的修改），可在其他站点的 Naive 主题设置中导入。
      </p>
      <NInput :autosize="{ minRows: 10, maxRows: 16 }" readonly type="textarea" :value="exportText" />
    </template>
    <template v-else>
      <p class="transfer-modal__tip">
        导入的设置会先写入草稿，确认预览无误后再保存。无法识别或类型不符的项会被忽略。
      </p>
      <NInput
        v-model:value="importText"
        :autosize="{ minRows: 10, maxRows: 16 }"
        placeholder="粘贴导出的 JSON，或选择文件"
        type="textarea"
      />
      <input ref="fileInput" accept="application/json,.json" class="transfer-modal__file" type="file" @change="readFile">
    </template>

    <template #footer>
      <div class="transfer-modal__footer">
        <template v-if="mode === 'export'">
          <NButton @click="download">
            <template #icon>
              <span class="i-icon-park-outline-download" />
            </template>
            下载文件
          </NButton>
          <NButton type="primary" @click="copy">
            <template #icon>
              <span class="i-icon-park-outline-copy" />
            </template>
            复制
          </NButton>
        </template>
        <template v-else>
          <NButton @click="chooseFile">
            <template #icon>
              <span class="i-icon-park-outline-upload" />
            </template>
            选择文件
          </NButton>
          <NButton type="primary" @click="submitImport">
            导入到草稿
          </NButton>
        </template>
      </div>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
.transfer-modal__tip {
  margin: 0 0 12px;
  color: var(--s-text-3);
  font-size: 13px;
  line-height: 1.6;
}

.transfer-modal__file {
  display: none;
}

.transfer-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
