<script setup lang="ts">
import type { AppIconName } from '@/components/AppIcon.vue'
import { NAvatar, NButton, NFlex, NH3, NPopover } from 'naive-ui'
import { computed, h, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import LiquidGlassSurface from '@/components/LiquidGlassSurface.vue'
import { useAppStore } from '@/stores/app'
import LoginDialog from './LoginDialog.vue'

const router = useRouter()
const appStore = useAppStore()

// 从 Provider 注入滚动状态
const isScrolled = inject<ReturnType<typeof ref<boolean>>>('isScrolled', ref(false))

const siteFavicon = ref('/favicon.ico')

// 计算页面容器的样式
const containerStyle = computed(() => {
  if (appStore.fullWidth) {
    return {}
  }
  return {
    maxWidth: appStore.maxPageWidth,
    marginInline: 'auto',
  }
})

const actionButtons = computed(() => {
  const buttons: {
    title: string
    icon: AppIconName
    action: 'toggleTheme' | 'jumpToSetting' | 'openLoginDialog'
    disabled: boolean
  }[] = [
    {
      title: appStore.themeMode === 'auto' ? '自动主题' : appStore.themeMode === 'light' ? '浅色主题' : '深色主题',
      icon: appStore.themeMode === 'auto' ? 'dark-mode' : appStore.themeMode === 'light' ? 'sun-one' : 'moon',
      action: 'toggleTheme',
      disabled: false,
    },
  ]

  // 已登录时显示设置按钮，未登录时根据配置决定是否显示登录按钮
  if (appStore.isLoggedIn) {
    buttons.push({
      title: '后台管理',
      icon: 'setting',
      action: 'jumpToSetting',
      disabled: false,
    })
  }
  else if (appStore.showLoginButton) {
    buttons.push({
      title: '登录',
      icon: 'login',
      action: 'openLoginDialog',
      disabled: false,
    })
  }

  return buttons
})

const hasLiquidGlass = computed(() => appStore.isLiquidGlassScopeEnabled('interface'))

function handleButtonClick(action: string) {
  switch (action) {
    case 'toggleTheme':
      appStore.updateThemeMode()
      break
    case 'jumpToSetting':
      // 设置页由 Server 提供，不能使用无极路由
      location.href = '/admin'
      break
    case 'openLoginDialog':
      window.$modal.create({
        title: '登录',
        preset: 'dialog',
        showIcon: false,
        content: () => h(LoginDialog),
      })
      break
  }
}
</script>

<template>
  <div class="top-0 position-sticky z-10">
    <LiquidGlassSurface
      scope="interface"
      :enabled="isScrolled"
      class="header-glass transition-all duration-200"
      :class="[
        isScrolled ? 'bg-$n-color shadow-sm backdrop-blur-md' : 'bg-transparent',
        { 'header-glass--enabled': hasLiquidGlass && isScrolled },
      ]"
    >
      <div class="px-4 flex-between h-16" :style="containerStyle">
        <NFlex class="flex-center cursor-pointer" @click="router.push('/')">
          <NAvatar :src="siteFavicon" round />
          <NH3 class="m-0">
            {{ appStore.publicSettings?.sitename || 'Komari Monitor' }}
          </NH3>
        </NFlex>
        <NFlex class="flex gap-4">
          <NPopover v-for="button in actionButtons" :key="button.action" :disabled="button.disabled">
            <template #trigger>
              <NButton
                :disabled="button.disabled"
                class="header-action-button p-2 h-8 w-8"
                text
                @click="handleButtonClick(button.action)"
              >
                <AppIcon class="header-action-icon" :name="button.icon" />
              </NButton>
            </template>
            <template #default>
              {{ button.title }}
            </template>
          </NPopover>
        </NFlex>
      </div>
    </LiquidGlassSurface>
  </div>
</template>

<style scoped lang="scss">
.header-glass {
  display: block;
  width: 100%;
}

.header-glass--enabled {
  background-color: transparent !important;
}

html.dark .header-glass--enabled {
  background-color: transparent !important;
}

.header-action-button {
  color: rgba(15, 23, 42, 0.92) !important;
  background-color: rgba(255, 255, 255, 0.76) !important;
  border: 1px solid rgba(255, 255, 255, 0.58) !important;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
}

.header-action-button:hover {
  color: rgba(15, 23, 42, 1) !important;
  background-color: rgba(255, 255, 255, 0.9) !important;
}

.header-action-button :deep(.n-button__content) {
  color: inherit !important;
}

.header-action-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: inherit !important;
}

html.dark .header-action-button {
  color: rgba(248, 250, 252, 0.96) !important;
  background-color: rgba(15, 23, 42, 0.74) !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3);
}

html.dark .header-action-button:hover {
  color: #fff !important;
  background-color: rgba(30, 41, 59, 0.88) !important;
}
</style>
