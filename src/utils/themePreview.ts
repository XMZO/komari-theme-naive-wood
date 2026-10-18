import type { StorageLike } from '@vueuse/core'
import type { PreviewMessage } from '@/settings/previewProtocol'
import type { useAppStore } from '@/stores/app'
import {
  PREVIEW_MESSAGE_COLOR_SCHEME,
  PREVIEW_MESSAGE_READY,
  PREVIEW_MESSAGE_SETTINGS,
  PREVIEW_MESSAGE_VIEW_MODE,
  PREVIEW_QUERY_KEY,
} from '@/settings/previewProtocol'
import { withThemeSettingDefaults } from '@/settings/schema'

/** 前台被设置页以同源 iframe 嵌入、用于实时预览 */
export const isThemePreview = detectThemePreview()

function detectThemePreview(): boolean {
  if (window.parent === window) {
    return false
  }
  try {
    return new URLSearchParams(window.location.search).has(PREVIEW_QUERY_KEY)
      && window.parent.location.origin === window.location.origin
  }
  catch {
    return false
  }
}

function createMemoryStorage(): StorageLike {
  const items = new Map<string, string>()
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value)
    },
    removeItem: (key) => {
      items.delete(key)
    },
  }
}

// 预览与前台同源，偏好只存内存，避免在预览里切换视图或明暗时改掉管理员自己浏览前台的选择。
export const preferenceStorage: StorageLike = isThemePreview ? createMemoryStorage() : localStorage

let bridgeInstalled = false

/** 接收设置页发来的草稿与明暗模式，并通知设置页预览已就绪 */
export function installThemePreviewBridge(appStore: ReturnType<typeof useAppStore>): void {
  if (!isThemePreview || bridgeInstalled) {
    return
  }
  bridgeInstalled = true

  window.addEventListener('message', (event: MessageEvent<PreviewMessage>) => {
    if (event.source !== window.parent || event.origin !== window.location.origin) {
      return
    }
    const message = event.data
    if (!message || typeof message !== 'object') {
      return
    }

    if (message.type === PREVIEW_MESSAGE_SETTINGS && message.settings && typeof message.settings === 'object' && appStore.publicSettings) {
      const previousDefaultViewMode = appStore.defaultViewMode
      appStore.publicSettings = {
        ...appStore.publicSettings,
        theme_settings: withThemeSettingDefaults(message.settings),
      }
      // 预览需要直接反映默认视图的修改
      if (appStore.defaultViewMode !== previousDefaultViewMode) {
        appStore.nodeViewMode = appStore.defaultViewMode
      }
      return
    }

    if (message.type === PREVIEW_MESSAGE_COLOR_SCHEME && (message.scheme === 'light' || message.scheme === 'dark')) {
      appStore.updateThemeMode(message.scheme)
      return
    }

    // 编辑卡片或列表设置时切换到对应视图，便于直接看到效果
    if (message.type === PREVIEW_MESSAGE_VIEW_MODE && (message.viewMode === 'card' || message.viewMode === 'list')) {
      appStore.nodeViewMode = message.viewMode
    }
  })

  window.parent.postMessage({ type: PREVIEW_MESSAGE_READY } satisfies PreviewMessage, window.location.origin)
}
