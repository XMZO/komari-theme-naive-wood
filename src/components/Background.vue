<script setup lang="ts">
import { NButton } from 'naive-ui'
import { computed, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { useAppStore } from '@/stores/app'
import { createBackgroundProxyKey, ensureBackgroundProxyReady, getBackgroundProxyUrl } from '@/utils/backgroundProxy'

const appStore = useAppStore()

// 背景加载状态
const isLoaded = ref(false)
const hasError = ref(false)
const isSaving = ref(false)
const imageDisplayUrl = ref('')
const imageDownloadUrl = ref('')
const imageProxyKey = ref('')
const imageProxyReady = ref(false)

// 计算背景样式
const backgroundStyle = computed(() => {
  const blur = appStore.backgroundBlur
  return {
    filter: blur > 0 ? `blur(${blur}px)` : 'none',
  }
})

// 计算遮罩样式
const overlayStyle = computed(() => {
  if (appStore.backgroundOverlay <= 0) {
    return {}
  }

  return {
    backgroundColor: `rgba(0, 0, 0, ${appStore.backgroundOverlay / 100})`,
  }
})

// 是否启用自定义背景
const showBackground = computed(() => {
  return appStore.backgroundEnabled
})

// 当前背景 URL
const currentUrl = computed(() => appStore.currentBackgroundUrl)

// 背景类型
const backgroundType = computed(() => appStore.backgroundType)

// 是否显示加载完成的背景
const showLoadedBackground = computed(() => {
  return showBackground.value && currentUrl.value && isLoaded.value && !hasError.value
})

const showMediaBackground = computed(() => {
  if (!showBackground.value || !currentUrl.value || hasError.value) {
    return false
  }

  if (backgroundType.value === 'image') {
    return Boolean(imageDisplayUrl.value)
  }

  return true
})

const showSaveButton = computed(() => {
  return appStore.showSaveBackgroundButton && showBackground.value && Boolean(currentUrl.value) && !hasError.value
})

// 是否显示默认背景（未启用自定义背景、未配置 URL、或加载失败时）
const showDefaultBackground = computed(() => {
  if (!showBackground.value) {
    return false
  }
  // 没有配置 URL 时显示默认背景
  if (!currentUrl.value) {
    return true
  }
  // 加载失败时显示默认背景
  if (hasError.value) {
    return true
  }
  return false
})

// 是否显示加载中状态（有 URL 但未加载完成且未失败）
const showLoadingBackground = computed(() => {
  return showBackground.value && currentUrl.value && !isLoaded.value && !hasError.value
})

// 图片加载处理。优先走同源 Service Worker 缓存桥，显示和下载复用同一次随机结果。
let imageRequestId = 0
let imageFallbackTimer: number | null = null

function clearImageFallbackTimer() {
  if (imageFallbackTimer !== null) {
    window.clearTimeout(imageFallbackTimer)
    imageFallbackTimer = null
  }
}

function resetImageState() {
  clearImageFallbackTimer()
  imageDisplayUrl.value = ''
  imageDownloadUrl.value = ''
  imageProxyKey.value = ''
  imageProxyReady.value = false
}

async function loadImage(url: string) {
  const requestId = ++imageRequestId
  resetImageState()
  isLoaded.value = false
  hasError.value = false

  imageFallbackTimer = window.setTimeout(() => {
    if (requestId !== imageRequestId || imageDisplayUrl.value) {
      return
    }

    imageDisplayUrl.value = url
  }, 1800)

  const proxyReady = await ensureBackgroundProxyReady()
  if (requestId !== imageRequestId) {
    return
  }

  if (!proxyReady) {
    if (!imageDisplayUrl.value) {
      imageDisplayUrl.value = url
    }
    return
  }

  const proxyKey = createBackgroundProxyKey()
  const filename = getBackgroundFileName(url)
  const proxyImageUrl = getBackgroundProxyUrl('image', url, proxyKey)
  const proxyDownloadUrl = getBackgroundProxyUrl('download', url, proxyKey, filename)

  clearImageFallbackTimer()
  imageProxyKey.value = proxyKey
  imageProxyReady.value = true
  imageDownloadUrl.value = proxyDownloadUrl
  imageDisplayUrl.value = proxyImageUrl
}

function handleImageLoaded() {
  isLoaded.value = true
  hasError.value = false
}

function handleImageError() {
  if (imageProxyReady.value && currentUrl.value && imageDisplayUrl.value !== currentUrl.value) {
    imageDownloadUrl.value = ''
    imageProxyKey.value = ''
    imageProxyReady.value = false
    imageDisplayUrl.value = currentUrl.value
    isLoaded.value = false
    hasError.value = false
    return
  }

  isLoaded.value = false
  hasError.value = true
}

// 视频加载处理
const videoRef = ref<HTMLVideoElement | null>(null)

function handleVideoLoaded() {
  isLoaded.value = true
  hasError.value = false
}

function handleVideoError() {
  isLoaded.value = false
  hasError.value = true
}

function getMimeExtension(mimeType?: string) {
  const normalizedMimeType = mimeType?.split(';')[0]?.trim().toLowerCase()
  const extensionMap: Record<string, string> = {
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  }

  return normalizedMimeType ? extensionMap[normalizedMimeType] : undefined
}

function getUrlExtension(url: string) {
  try {
    const pathname = new URL(url, window.location.href).pathname
    const filename = pathname.split('/').pop() ?? ''
    const match = filename.match(/\.([a-z0-9]{2,5})$/i)
    return match?.[1]?.toLowerCase()
  }
  catch {
    return undefined
  }
}

function getBackgroundFileName(sourceUrl: string, blob?: Blob | null) {
  const fallbackExtension = backgroundType.value === 'video' ? 'mp4' : 'jpg'
  const extension = getMimeExtension(blob?.type) ?? getUrlExtension(sourceUrl) ?? fallbackExtension
  const now = new Date()
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')

  return `komari-background-${timestamp}.${extension}`
}

function triggerDownload(url: string, filename: string, openInNewTab = false) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener noreferrer'
  if (openInNewTab) {
    link.target = '_blank'
  }
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function fetchCurrentBackgroundBlob(sourceUrl: string) {
  const response = await fetch(sourceUrl, { credentials: 'same-origin' })
  if (!response.ok) {
    throw new Error(`Failed to save background: ${response.status}`)
  }
  return {
    blob: await response.blob(),
    sourceUrl: response.url || sourceUrl,
  }
}

async function saveCurrentBackground() {
  if (isSaving.value || !currentUrl.value) {
    return
  }

  if (backgroundType.value === 'image' && !imageDownloadUrl.value) {
    window.$message?.error('当前浏览器环境不支持一键保存这个跨域随机背景')
    return
  }

  isSaving.value = true

  try {
    if (backgroundType.value === 'image') {
      triggerDownload(imageDownloadUrl.value, getBackgroundFileName(currentUrl.value))
      window.$message?.success('已开始保存当前背景')
      return
    }

    const mediaUrl = videoRef.value?.currentSrc || currentUrl.value
    const result = await fetchCurrentBackgroundBlob(mediaUrl)
    const objectUrl = URL.createObjectURL(result.blob)
    triggerDownload(objectUrl, getBackgroundFileName(result.sourceUrl, result.blob))
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    window.$message?.success('已开始保存当前背景')
  }
  catch {
    window.$message?.error('当前背景源无法跨域读取，保存失败')
  }
  finally {
    isSaving.value = false
  }
}

// 监听 URL 变化
watch(currentUrl, (url) => {
  if (url && backgroundType.value === 'image') {
    void loadImage(url)
  }
  else if (url && backgroundType.value === 'video') {
    imageRequestId += 1
    resetImageState()
    // 视频通过事件处理
    isLoaded.value = false
    hasError.value = false
  }
  else {
    imageRequestId += 1
    resetImageState()
    // 没有 URL 时重置状态
    isLoaded.value = false
    hasError.value = false
  }
}, { immediate: true })

// 监听背景类型变化
watch(backgroundType, (type) => {
  if (type === 'image' && currentUrl.value) {
    void loadImage(currentUrl.value)
  }
  else {
    imageRequestId += 1
    resetImageState()
  }
})

// 组件卸载时清理
onUnmounted(() => {
  imageRequestId += 1
  resetImageState()
})
</script>

<template>
  <template v-if="showBackground">
    <div class="background-container">
      <!-- 默认背景（渐变背景，用于未配置或加载失败时） -->
      <Transition name="fade">
        <div v-if="showDefaultBackground" class="background-default" />
      </Transition>

      <!-- 加载中占位（渐变背景） -->
      <Transition name="fade">
        <div v-if="showLoadingBackground" class="background-loading" />
      </Transition>

      <!-- 自定义背景媒体层 -->
      <Transition name="fade">
        <div
          v-if="showMediaBackground"
          class="background-media"
          :class="{ 'background-media--loaded': showLoadedBackground }"
          :style="backgroundStyle"
        >
          <!-- 图片背景 -->
          <img
            v-if="backgroundType === 'image'"
            alt=""
            class="background-image"
            draggable="false"
            :src="imageDisplayUrl"
            @error="handleImageError"
            @load="handleImageLoaded"
          >
          <!-- 视频背景 -->
          <video
            v-else-if="backgroundType === 'video'"
            ref="videoRef"
            class="background-video"
            :src="currentUrl"
            autoplay
            loop
            muted
            playsinline
            @loadeddata="handleVideoLoaded"
            @error="handleVideoError"
          />
        </div>
      </Transition>

      <!-- 遮罩层 -->
      <div class="background-overlay" :style="overlayStyle" />
    </div>

    <NButton
      v-if="showSaveButton"
      circle
      class="background-save-button"
      :disabled="isSaving"
      :loading="isSaving"
      size="small"
      title="保存当前背景"
      aria-label="保存当前背景"
      @click="saveCurrentBackground"
    >
      <AppIcon class="background-save-button__icon" name="download" />
    </NButton>
  </template>
</template>

<style scoped lang="scss">
.background-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -1;
  overflow: hidden;
}

.background-default,
.background-loading {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

// 默认背景：亮色模式 - 温暖的渐变色
.background-default {
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 25%, #d4e5f7 50%, #e8e0f0 75%, #f5f0e8 100%);
  background-size: 400% 400%;
  animation: gradientShift 15s ease infinite;
}

// 暗色模式 - 深邃的渐变色
html.dark .background-default {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #1f3a5f 50%, #2d2d44 75%, #1a1a2e 100%);
  background-size: 400% 400%;
  animation: gradientShift 20s ease infinite;
}

// 加载中背景：亮色模式
.background-loading {
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 25%, #d4e5f7 50%, #e8e0f0 75%, #f5f0e8 100%);
  background-size: 400% 400%;
  animation: gradientShift 15s ease infinite;
}

// 加载中背景：暗色模式
html.dark .background-loading {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #1f3a5f 50%, #2d2d44 75%, #1a1a2e 100%);
  background-size: 400% 400%;
  animation: gradientShift 20s ease infinite;
}

// 渐变动画
@keyframes gradientShift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.background-media {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transform: scale(1.1); // 防止模糊边缘露出白边
  transition: opacity 0.8s ease;
}

.background-media--loaded {
  opacity: 1;
}

.background-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.background-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.background-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.background-save-button {
  position: fixed;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
  z-index: 100;
  color: rgba(17, 24, 39, 0.9) !important;
  background-color: rgba(255, 255, 255, 0.72) !important;
  border: 1px solid rgba(255, 255, 255, 0.58) !important;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(10px) saturate(150%);
  -webkit-backdrop-filter: blur(10px) saturate(150%);
}

.background-save-button:hover {
  background-color: rgba(255, 255, 255, 0.84) !important;
}

html.dark .background-save-button {
  color: rgba(248, 250, 252, 0.94) !important;
  background-color: rgba(15, 23, 42, 0.74) !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
}

html.dark .background-save-button:hover {
  background-color: rgba(30, 41, 59, 0.82) !important;
}

.background-save-button__icon {
  width: 1rem;
  height: 1rem;
}

// 过渡动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.8s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
