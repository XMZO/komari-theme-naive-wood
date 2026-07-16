import type { RouteLocationNormalized, RouteLocationNormalizedLoaded } from 'vue-router'
import type { VisitorAuditEvent } from '@/utils/rpc'
import { getSharedRpc, isRpcMethodUnavailable } from '@/utils/rpc'

let enabled = false
let methodUnavailableUntil = 0
let lastPageKey = ''

export function configureVisitorAudit(value: boolean): void {
  enabled = value
  if (!value) {
    lastPageKey = ''
  }
}

export async function recordVisitorEvent(event: VisitorAuditEvent): Promise<void> {
  if (!enabled || Date.now() < methodUnavailableUntil)
    return

  try {
    await getSharedRpc().recordVisitorEvent(event)
  }
  catch (error) {
    if (isRpcMethodUnavailable(error)) {
      methodUnavailableUntil = Date.now() + 5 * 60_000
      return
    }
    // 审计属于旁路能力，网络或后端错误不能影响页面功能。
    console.warn('[VisitorAudit] Failed to record event:', error)
  }
}

export function recordPageView(route: RouteLocationNormalized | RouteLocationNormalizedLoaded): void {
  if (!enabled)
    return

  const routeName = typeof route.name === 'string' ? route.name : ''
  const path = route.path || window.location.pathname
  const target = typeof route.params.id === 'string' ? route.params.id : ''
  recordResolvedPageView(path, routeName, target)
}

export function recordCurrentPageView(): void {
  if (!enabled)
    return
  const path = window.location.pathname
  const match = path.match(/^\/instance\/([^/]+)$/)
  recordResolvedPageView(path, match ? 'instance-detail' : 'home', match ? decodeURIComponent(match[1] ?? '') : '')
}

function recordResolvedPageView(path: string, routeName: string, target: string): void {
  const pageKey = `${routeName}\u0000${path}`
  if (pageKey === lastPageKey)
    return
  lastPageKey = pageKey

  void recordVisitorEvent({
    event: 'page_view',
    path,
    route: routeName,
  })

  if (routeName === 'instance-detail' && target) {
    void recordVisitorEvent({
      event: 'node_open',
      path,
      route: routeName,
      target,
    })
  }
}
