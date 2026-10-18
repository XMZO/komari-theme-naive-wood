import type { SettingsRecord, SettingValue } from './schema'
import { computed, ref } from 'vue'
import { loadThemeSettings, saveThemeSettings, SettingsRequestError } from './api'
import { SETTING_FIELD_MAP, SETTING_FIELDS, THEME_SETTING_DEFAULTS } from './schema'

export type DraftStatus = 'loading' | 'ready' | 'unauthorized' | 'error'

export interface ImportResult {
  applied: number
  ignored: string[]
}

const EXPORT_FORMAT = 'komari-theme-naive-settings'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 类型不符的已存值在前台本就会回退默认值，这里同样处理，保证控件拿到正确类型。
function normalizeSettings(stored: SettingsRecord): Record<string, SettingValue> {
  return Object.fromEntries(SETTING_FIELDS.map((field) => {
    const value = stored[field.key]
    return [field.key, typeof value === typeof field.default ? value as SettingValue : field.default]
  }))
}

export function useSettingsDraft() {
  const status = ref<DraftStatus>('loading')
  const errorMessage = ref('')
  const saving = ref(false)
  const sitename = ref('')
  const saved = ref<Record<string, SettingValue>>({ ...THEME_SETTING_DEFAULTS })
  const draft = ref<Record<string, SettingValue>>({ ...THEME_SETTING_DEFAULTS })
  // 设置定义之外的已存项（例如更新版本主题写入的配置），保存时原样保留。
  let extras: SettingsRecord = {}
  // 最近一次由用户编辑的设置项；加载与撤销不计入
  const lastEditedKeys = ref<readonly string[]>([])

  const dirtyKeys = computed(() => SETTING_FIELDS
    .filter(field => !Object.is(draft.value[field.key], saved.value[field.key]))
    .map(field => field.key))
  const dirtyKeySet = computed(() => new Set(dirtyKeys.value))

  async function load() {
    status.value = 'loading'
    errorMessage.value = ''
    try {
      const loaded = await loadThemeSettings()
      if (!loaded.loggedIn) {
        status.value = 'unauthorized'
        return
      }
      const normalized = normalizeSettings(loaded.settings)
      extras = Object.fromEntries(Object.entries(loaded.settings).filter(([key]) => !SETTING_FIELD_MAP.has(key)))
      sitename.value = loaded.sitename
      saved.value = normalized
      draft.value = { ...normalized }
      status.value = 'ready'
    }
    catch (error) {
      if (error instanceof SettingsRequestError && (error.status === 401 || error.status === 403)) {
        status.value = 'unauthorized'
        return
      }
      errorMessage.value = error instanceof Error ? error.message : String(error)
      status.value = 'error'
    }
  }

  function setValue(key: string, value: SettingValue) {
    draft.value[key] = value
    lastEditedKeys.value = [key]
  }

  function resetToDefault(keys: Iterable<string>) {
    const edited: string[] = []
    for (const key of keys) {
      const fallback = THEME_SETTING_DEFAULTS[key]
      if (fallback !== undefined) {
        draft.value[key] = fallback
        edited.push(key)
      }
    }
    lastEditedKeys.value = edited
  }

  function discard() {
    draft.value = { ...saved.value }
  }

  async function save() {
    saving.value = true
    try {
      const snapshot = { ...draft.value }
      // 保存接口会整体替换已存配置，必须带上全部设置项和未知项。
      await saveThemeSettings(__THEME_SHORT__, { ...extras, ...snapshot })
      saved.value = snapshot
    }
    finally {
      saving.value = false
    }
  }

  function exportSettings(): string {
    return JSON.stringify({
      format: EXPORT_FORMAT,
      version: __BUILD_VERSION__,
      exportedAt: new Date().toISOString(),
      settings: draft.value,
    }, null, 2)
  }

  /** 导入只写入草稿，确认无误后再保存；未知项和类型不符的项会被忽略 */
  function importSettings(text: string): ImportResult {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) {
      throw new Error('配置必须是 JSON 对象')
    }
    const source = parsed.format === EXPORT_FORMAT && isRecord(parsed.settings) ? parsed.settings : parsed
    const ignored: string[] = []
    const applied: string[] = []
    for (const [key, value] of Object.entries(source)) {
      const fallback = THEME_SETTING_DEFAULTS[key]
      if (fallback === undefined || typeof value !== typeof fallback) {
        ignored.push(key)
        continue
      }
      draft.value[key] = value as SettingValue
      applied.push(key)
    }
    lastEditedKeys.value = applied
    return { applied: applied.length, ignored }
  }

  return {
    status,
    errorMessage,
    saving,
    sitename,
    saved,
    draft,
    dirtyKeys,
    dirtyKeySet,
    lastEditedKeys,
    load,
    setValue,
    resetToDefault,
    discard,
    save,
    exportSettings,
    importSettings,
  }
}

export type SettingsDraft = ReturnType<typeof useSettingsDraft>
