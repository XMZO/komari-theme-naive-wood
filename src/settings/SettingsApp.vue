<script setup lang="ts">
import type { GlobalThemeOverrides } from 'naive-ui'
import { darkTheme, dateZhCN, NConfigProvider, NDialogProvider, NMessageProvider, zhCN } from 'naive-ui'
import { computed, provide, watchEffect } from 'vue'
import { derivePrimaryStates, isHexColor } from './color'
import SettingsWorkbench from './components/SettingsWorkbench.vue'
import { SETTINGS_DRAFT_KEY } from './context'
import { THEME_SETTING_DEFAULTS } from './schema'
import { useHostDark } from './useHostDark'
import { useSettingsDraft } from './useSettingsDraft'

const draftApi = useSettingsDraft()
provide(SETTINGS_DRAFT_KEY, draftApi)

const isDark = useHostDark()

// 设置页的强调色直接使用正在编辑的主题色。
const primaryColors = computed(() => {
  const prefix = isDark.value ? 'dark' : 'light'
  const draft = draftApi.draft.value
  const primary = isHexColor(draft[`${prefix}PrimaryColor`]) ? String(draft[`${prefix}PrimaryColor`]) : String(THEME_SETTING_DEFAULTS[`${prefix}PrimaryColor`])
  const derived = derivePrimaryStates(primary)
  return {
    primary,
    hover: isHexColor(draft[`${prefix}PrimaryColorHover`]) ? String(draft[`${prefix}PrimaryColorHover`]) : derived.hover,
    pressed: isHexColor(draft[`${prefix}PrimaryColorPressed`]) ? String(draft[`${prefix}PrimaryColorPressed`]) : derived.pressed,
  }
})

const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: primaryColors.value.primary,
    primaryColorHover: primaryColors.value.hover,
    primaryColorPressed: primaryColors.value.pressed,
    primaryColorSuppl: primaryColors.value.hover,
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontFamily: '"MiSans VF", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
}))

watchEffect(() => {
  const root = document.documentElement
  root.classList.toggle('dark', isDark.value)
  root.style.setProperty('--s-primary', primaryColors.value.primary)
})
</script>

<template>
  <NConfigProvider
    abstract
    :date-locale="dateZhCN"
    :locale="zhCN"
    :theme="isDark ? darkTheme : null"
    :theme-overrides="themeOverrides"
  >
    <NMessageProvider placement="bottom">
      <NDialogProvider>
        <SettingsWorkbench :host-dark="isDark" />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
