/** 设置页与前台预览之间的 postMessage 协议，双方都只接受同源消息。 */

export const PREVIEW_QUERY_KEY = 'naive_preview'

export const PREVIEW_MESSAGE_READY = 'naive-preview:ready'
export const PREVIEW_MESSAGE_SETTINGS = 'naive-preview:settings'
export const PREVIEW_MESSAGE_COLOR_SCHEME = 'naive-preview:color-scheme'
export const PREVIEW_MESSAGE_VIEW_MODE = 'naive-preview:view-mode'

export type PreviewColorScheme = 'light' | 'dark'
export type PreviewViewMode = 'card' | 'list'

export type PreviewMessage
  = | { type: typeof PREVIEW_MESSAGE_READY }
    | { type: typeof PREVIEW_MESSAGE_SETTINGS, settings: Record<string, unknown> }
    | { type: typeof PREVIEW_MESSAGE_COLOR_SCHEME, scheme: PreviewColorScheme }
    | { type: typeof PREVIEW_MESSAGE_VIEW_MODE, viewMode: PreviewViewMode }
