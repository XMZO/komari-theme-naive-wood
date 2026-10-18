import { usePreferredDark } from '@vueuse/core'
import { computed, onScopeDispose, ref } from 'vue'

/** 跟随 Komari 后台的明暗模式（后台在 <html> 上切换 dark 类名）；单独打开时跟随系统。 */
export function useHostDark() {
  const preferredDark = usePreferredDark()
  const hostDark = ref<boolean | null>(null)

  try {
    if (window.parent !== window) {
      const root = window.parent.document.documentElement
      const update = () => {
        hostDark.value = root.classList.contains('dark')
      }
      update()
      const observer = new MutationObserver(update)
      observer.observe(root, { attributes: true, attributeFilter: ['class'] })
      onScopeDispose(() => observer.disconnect())
    }
  }
  catch {
    // 父页面不同源时无法读取，退回跟随系统
  }

  return computed(() => hostDark.value ?? preferredDark.value)
}
