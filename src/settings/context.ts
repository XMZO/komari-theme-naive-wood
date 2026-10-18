import type { InjectionKey } from 'vue'
import type { SettingsDraft } from './useSettingsDraft'
import { inject } from 'vue'

export const SETTINGS_DRAFT_KEY: InjectionKey<SettingsDraft> = Symbol('settings-draft')

export function useDraft(): SettingsDraft {
  const draft = inject(SETTINGS_DRAFT_KEY)
  if (!draft) {
    throw new Error('Settings draft is not provided')
  }
  return draft
}
