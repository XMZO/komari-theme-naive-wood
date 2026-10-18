<script setup lang="ts">
import type { PreviewColorScheme, PreviewMessage, PreviewViewMode } from '../previewProtocol'
import type { SettingValue } from '../schema'
import { useDebounceFn, useEventListener, useResizeObserver } from '@vueuse/core'
import { NButton, NRadioButton, NRadioGroup, NSpin } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  PREVIEW_MESSAGE_COLOR_SCHEME,
  PREVIEW_MESSAGE_READY,
  PREVIEW_MESSAGE_SETTINGS,
  PREVIEW_MESSAGE_VIEW_MODE,
  PREVIEW_QUERY_KEY,
} from '../previewProtocol'

const props = defineProps<{
  settings: Record<string, SettingValue>
  hostDark: boolean
  reloadHint: boolean
  /** 正在编辑的视图相关设置，预览会切换到对应视图 */
  viewMode?: PreviewViewMode | null
}>()

type Device = 'desktop' | 'tablet' | 'mobile'

const DEVICES: Record<Device, { label: string, width: number, icon: string }> = {
  desktop: { label: '桌面', width: 1440, icon: 'i-icon-park-outline-computer' },
  tablet: { label: '平板', width: 834, icon: 'i-icon-park-outline-ipad' },
  mobile: { label: '手机', width: 390, icon: 'i-icon-park-outline-iphone' },
}
const MOBILE_MAX_HEIGHT = 844

const device = ref<Device>('desktop')
const scheme = ref<PreviewColorScheme>(props.hostDark ? 'dark' : 'light')
const frame = ref<HTMLIFrameElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const ready = ref(false)
const frameKey = ref(0)
const src = `/?${PREVIEW_QUERY_KEY}=1`

const stageWidth = ref(0)
const stageHeight = ref(0)

// ResizeObserver 只在页面渲染时回调，挂载与窗口缩放时再主动测量一次，避免首帧拿到 0。
function measureStage() {
  const rect = stage.value?.getBoundingClientRect()
  if (rect) {
    stageWidth.value = rect.width
    stageHeight.value = rect.height
  }
}

useResizeObserver(stage, measureStage)
useEventListener(window, 'resize', measureStage)
onMounted(() => nextTick(measureStage))

// 前台按真实逻辑宽度渲染，再整体缩放进预览区，避免窄面板把桌面布局挤成移动端。
const padding = computed(() => device.value === 'desktop' ? 0 : 20)
const frameWidth = computed(() => DEVICES[device.value].width)
const scale = computed(() => {
  const available = Math.max(stageWidth.value - padding.value * 2, 120)
  return Math.min(1, available / frameWidth.value)
})
const frameHeight = computed(() => {
  const available = Math.max(stageHeight.value - padding.value * 2, 200) / scale.value
  return device.value === 'mobile' ? Math.min(available, MOBILE_MAX_HEIGHT) : available
})

function post(message: PreviewMessage) {
  frame.value?.contentWindow?.postMessage(message, window.location.origin)
}

function postSettings() {
  // 草稿是响应式代理，postMessage 无法克隆，先转成普通对象。
  post({ type: PREVIEW_MESSAGE_SETTINGS, settings: JSON.parse(JSON.stringify(props.settings)) })
}

function postScheme() {
  post({ type: PREVIEW_MESSAGE_COLOR_SCHEME, scheme: scheme.value })
}

function postViewMode() {
  if (props.viewMode) {
    post({ type: PREVIEW_MESSAGE_VIEW_MODE, viewMode: props.viewMode })
  }
}

function handleMessage(event: MessageEvent<PreviewMessage>) {
  if (event.source !== frame.value?.contentWindow || event.origin !== window.location.origin) {
    return
  }
  if (event.data?.type === PREVIEW_MESSAGE_READY) {
    ready.value = true
    postSettings()
    postScheme()
    postViewMode()
  }
}

const postSettingsDebounced = useDebounceFn(() => {
  if (ready.value) {
    postSettings()
  }
}, 120)

watch(() => props.settings, postSettingsDebounced, { deep: true })
watch(scheme, () => {
  if (ready.value) {
    postScheme()
  }
})
// 切换设备时重新加载，背景横竖图等只在加载时决定的内容才会按新尺寸生效
watch(device, () => reload())
watch(() => props.viewMode, () => {
  if (ready.value) {
    postViewMode()
  }
})
watch(() => props.hostDark, (dark) => {
  scheme.value = dark ? 'dark' : 'light'
})

function toggleScheme() {
  scheme.value = scheme.value === 'dark' ? 'light' : 'dark'
}

function reload() {
  ready.value = false
  frameKey.value++
}

function openSite() {
  window.open('/', '_blank', 'noopener')
}

onMounted(() => window.addEventListener('message', handleMessage))
onBeforeUnmount(() => window.removeEventListener('message', handleMessage))
</script>

<template>
  <div class="preview">
    <div class="preview__toolbar">
      <div class="preview__title">
        <span class="preview__live" :class="{ 'preview__live--on': ready }" />
        实时预览
      </div>
      <div class="preview__tools">
        <NRadioGroup v-model:value="device" size="small">
          <NRadioButton v-for="(item, key) in DEVICES" :key="key" :title="item.label" :value="key">
            <span class="preview__device-icon" :class="item.icon" />
          </NRadioButton>
        </NRadioGroup>
        <NButton circle quaternary size="small" :title="scheme === 'dark' ? '切换到亮色' : '切换到暗色'" @click="toggleScheme">
          <span :class="scheme === 'dark' ? 'i-icon-park-outline-moon' : 'i-icon-park-outline-sun-one'" />
        </NButton>
        <NButton circle quaternary size="small" title="重新加载预览" @click="reload">
          <span class="i-icon-park-outline-refresh" />
        </NButton>
        <NButton circle quaternary size="small" title="在新标签页打开前台" @click="openSite">
          <span class="i-icon-park-outline-share" />
        </NButton>
      </div>
    </div>

    <div v-if="reloadHint" class="preview__hint">
      <span class="i-icon-park-outline-info" />
      连接方式与刷新间隔不会在预览中体现，保存后刷新前台即可生效
    </div>

    <div ref="stage" class="preview__stage" :class="`preview__stage--${device}`">
      <div
        class="preview__device"
        :style="{ width: `${frameWidth * scale}px`, height: `${frameHeight * scale}px` }"
      >
        <iframe
          :key="frameKey"
          ref="frame"
          class="preview__frame"
          :src="src"
          :style="{ width: `${frameWidth}px`, height: `${frameHeight}px`, transform: `scale(${scale})` }"
          title="前台预览"
        />
        <div v-if="!ready" class="preview__loading">
          <NSpin size="small" />
          <span>正在加载前台…</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--s-border);
  border-radius: 14px;
  background: var(--s-surface);
  box-shadow: var(--s-shadow);
}

.preview__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--s-border);
}

.preview__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.preview__live {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--s-text-3);
  transition: background-color 0.2s ease;
}

.preview__live--on {
  background: #18a058;
  box-shadow: 0 0 0 3px rgb(24 160 88 / 18%);
}

.preview__tools {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.preview__device-icon {
  display: block;
  font-size: 14px;
}

.preview__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--s-border);
  background: var(--s-warning-soft);
  color: var(--s-text-2);
  font-size: 12px;
}

.preview__stage {
  position: relative;
  display: flex;
  flex: 1;
  align-items: flex-start;
  justify-content: center;
  min-height: 0;
  overflow: hidden;
  background: var(--s-subtle);
}

.preview__stage--tablet,
.preview__stage--mobile {
  align-items: center;
  padding: 20px;
  background-image: radial-gradient(var(--s-border-strong) 1px, transparent 1px);
  background-size: 16px 16px;
}

.preview__device {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
}

.preview__stage--tablet .preview__device,
.preview__stage--mobile .preview__device {
  border-radius: 18px;
  box-shadow:
    0 0 0 6px var(--s-device-frame),
    0 18px 40px rgb(0 0 0 / 18%);
}

.preview__frame {
  display: block;
  border: 0;
  background: var(--s-surface);
  transform-origin: top left;
}

.preview__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--s-surface);
  color: var(--s-text-3);
  font-size: 13px;
}
</style>
