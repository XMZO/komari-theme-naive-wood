/**
 * 应用初始化、认证状态与 RPC 传输生命周期管理。
 */

import type { MeInfo, PublicSettings } from '@/utils/api'
import type { Client, KomariRpc, NodeStatus } from '@/utils/rpc'
import { h } from 'vue'
import LoginDialog from '@/components/LoginDialog.vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { ApiError, getSharedApi } from '@/utils/api'
import { getSharedRpc, isRpcAuthenticationError, RpcTransportError } from '@/utils/rpc'
import { configureVisitorAudit, recordCurrentPageView } from '@/utils/visitorAudit'

interface InitConfig {
  wsReconnectInterval?: number
  wsMaxReconnectAttempts?: number
  postFailureThreshold?: number
  sessionCheckInterval?: number
}

const DEFAULT_CONFIG: Required<InitConfig> = {
  wsReconnectInterval: 3000,
  wsMaxReconnectAttempts: 5,
  postFailureThreshold: 3,
  sessionCheckInterval: 60000,
}

type InitState = 'idle' | 'bootstrapping' | 'awaiting-auth' | 'running' | 'destroyed'

function isRecordResponse(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

class InitManager {
  private config: Required<InitConfig>
  private rpc: KomariRpc
  private appStore: ReturnType<typeof useAppStore>
  private nodesStore: ReturnType<typeof useNodesStore>
  private state: InitState = 'idle'
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private sessionCheckTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribeWsClose: (() => void) | null = null
  private unsubscribeWsError: (() => void) | null = null
  private isPolling = false
  private isCheckingSession = false
  private useWebSocket = false
  private postFailureCount = 0
  private loginModalShown = false
  private transportGeneration = 0
  private lifecycleGeneration = 0
  private authTransitionPromise: Promise<void> | null = null
  private loginReconnectPromise: Promise<void> | null = null

  constructor(config: InitConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.rpc = getSharedRpc()
    this.appStore = useAppStore()
    this.nodesStore = useNodesStore()
  }

  private getPollInterval(): number {
    const interval = this.appStore.publicSettings?.theme_settings?.dataUpdateInterval
    if (typeof interval === 'number' && interval >= 1 && interval <= 60) {
      return interval * 1000
    }
    return 3000
  }

  private beginLifecycleOperation(): number {
    return ++this.lifecycleGeneration
  }

  private isLifecycleCurrent(generation: number): boolean {
    return generation === this.lifecycleGeneration && this.state !== 'destroyed'
  }

  private isLegacyPrivateSiteBootstrapError(error: unknown): boolean {
    return error instanceof ApiError
      && error.httpStatus === 401
      && /private site.*login|please login first/i.test(error.message)
  }

  async init(): Promise<void> {
    if (this.state === 'running' || this.state === 'bootstrapping' || this.state === 'awaiting-auth') {
      return
    }
    if (this.state === 'destroyed') {
      throw new Error('InitManager has been destroyed')
    }

    this.state = 'bootstrapping'
    this.appStore.loading = true
    this.appStore.connectionError = false
    const generation = this.beginLifecycleOperation()

    try {
      const context = await this.fetchBootstrapContext()
      if (!this.isLifecycleCurrent(generation))
        return
      this.applyBootstrapContext(context)
      const { publicSettings, userInfo } = context
      if (this.requiresAuthentication(publicSettings, userInfo)) {
        this.enterAwaitingAuthentication()
        return
      }
      await this.finishInitialization(generation)
    }
    catch (error) {
      if (!this.isLifecycleCurrent(generation))
        return
      console.error('[InitManager] Initialization failed:', error)
      this.state = 'idle'
      this.appStore.loading = false
      this.appStore.connectionError = true
      throw error
    }
  }

  private async fetchBootstrapContext(): Promise<{ publicSettings: PublicSettings, userInfo: MeInfo }> {
    const api = getSharedApi()
    const publicSettingsPromise = api.getPublicSettings().catch((error): PublicSettings => {
      // Komari 1.2.5 及部分旧版私有站点会把登录页元信息接口也挡成 401。
      // 此时无法得知实际登录方式，因此同时保留密码与 OAuth 入口，登录后再刷新真配置。
      if (this.isLegacyPrivateSiteBootstrapError(error)) {
        return {
          sitename: 'Komari',
          description: '',
          custom_head: '',
          custom_body: '',
          disable_password_login: false,
          oauth_enable: true,
          oauth_provider: null,
          private_site: true,
          theme: '',
          theme_settings: null,
        } satisfies PublicSettings
      }
      throw error
    })
    const userInfoPromise = api.getMe().catch((error) => {
      // 兼容更旧的私有站点：/api/me 可能直接返回 401。
      if (this.isLegacyPrivateSiteBootstrapError(error)) {
        return { username: 'Guest', logged_in: false } satisfies MeInfo
      }
      throw error
    })

    const [publicSettings, userInfo] = await Promise.all([publicSettingsPromise, userInfoPromise])
    return { publicSettings, userInfo }
  }

  private applyBootstrapContext(context: { publicSettings: PublicSettings, userInfo: MeInfo }): void {
    this.appStore.publicSettings = context.publicSettings
    configureVisitorAudit(context.publicSettings.visitor_audit_enabled === true)
    recordCurrentPageView()
    this.applyUserInfo(context.userInfo)
  }

  private applyUserInfo(userInfo: MeInfo): void {
    if (userInfo.logged_in) {
      this.appStore.setUserInfo(userInfo)
    }
    else {
      this.appStore.clearUserInfo()
      this.appStore.userInfo = userInfo
    }
  }

  private requiresAuthentication(publicSettings: PublicSettings, userInfo: MeInfo): boolean {
    return Boolean(publicSettings.private_site && !userInfo.logged_in)
  }

  private getUserIdentity(userInfo: MeInfo | undefined): string {
    if (!userInfo?.logged_in)
      return ''
    return userInfo.uuid || `${userInfo.sso_type ?? ''}:${userInfo.sso_id ?? ''}:${userInfo.username}`
  }

  private async finishInitialization(generation: number): Promise<void> {
    const nodesData = await this.fetchNodesData()
    if (!this.isLifecycleCurrent(generation))
      return
    this.nodesStore.initNodes(nodesData.clients, nodesData.statuses)
    this.state = 'running'
    this.appStore.requireLogin = false
    this.appStore.loading = false
    this.appStore.connectionError = false
    this.startTransportAndPolling()
  }

  private enterAwaitingAuthentication(): void {
    this.stopTransportAndPolling()
    this.state = 'awaiting-auth'
    this.appStore.requireLogin = true
    this.appStore.loading = false
    this.appStore.connectionError = false
    this.appStore.clearUserInfo()
    this.nodesStore.clearNodes()
    this.showForceLoginModal()
  }

  private showForceLoginModal(): void {
    if (this.loginModalShown)
      return

    this.loginModalShown = true
    window.$modal.create({
      title: '登录',
      preset: 'dialog',
      showIcon: false,
      closeOnEsc: false,
      maskClosable: false,
      closable: false,
      autoFocus: true,
      content: () => h(LoginDialog, {
        onLoginSuccess: () => {
          this.loginModalShown = false
        },
      }),
    })
  }

  private async fetchNodesData(): Promise<{
    clients: Record<string, Client>
    statuses: Record<string, NodeStatus>
  }> {
    const [clientsResult, statusesResult] = await Promise.all([
      this.rpc.getNodes() as Promise<Record<string, Client>>,
      this.rpc.getNodesLatestStatus() as Promise<Record<string, NodeStatus>>,
    ])
    return { clients: clientsResult, statuses: statusesResult }
  }

  private startTransportAndPolling(): void {
    this.stopTransportAndPolling()
    const generation = ++this.transportGeneration
    const client = this.rpc.getClient()
    this.postFailureCount = 0
    this.nodesStore.updateWsState('disconnected', 0)

    this.unsubscribeWsClose = client.onWebSocketClose(() => {
      if (generation !== this.transportGeneration || this.state !== 'running' || !this.useWebSocket)
        return
      this.nodesStore.updateWsState('disconnected')
      this.scheduleReconnect(generation)
    })
    this.unsubscribeWsError = client.onWebSocketError(() => {
      if (generation === this.transportGeneration && this.state === 'running') {
        console.error('[InitManager] WebSocket error')
      }
    })

    this.useWebSocket = this.appStore.rpcTransportMode === 'websocket'
    if (this.useWebSocket) {
      void this.connectWebSocket(generation)
    }
    else {
      client.setTransport(false)
      this.nodesStore.updateWsState('disconnected', 0)
    }

    this.startPolling()
    this.startSessionMonitoring()
  }

  private async connectWebSocket(generation: number): Promise<void> {
    if (generation !== this.transportGeneration || this.state !== 'running' || !this.useWebSocket)
      return

    const client = this.rpc.getClient()
    client.setTransport(true)
    this.nodesStore.updateWsState('connecting', this.nodesStore.wsReconnectAttempts)

    try {
      await client.ensureWebSocketConnectedWithPing(10000)
      if (generation !== this.transportGeneration || this.state !== 'running' || !this.useWebSocket)
        return
      this.nodesStore.updateWsState('connected', 0)
      this.appStore.connectionError = false
    }
    catch (error) {
      if (generation !== this.transportGeneration || this.state !== 'running' || !this.useWebSocket)
        return
      if (this.isAuthenticationFailure(error)) {
        await this.handleAuthenticationChanged()
        return
      }
      console.error('[InitManager] WebSocket connection failed:', error)
      this.nodesStore.updateWsState('disconnected')
      this.scheduleReconnect(generation)
    }
  }

  private scheduleReconnect(generation: number): void {
    if (this.reconnectTimer || generation !== this.transportGeneration || !this.useWebSocket)
      return

    const attempts = this.nodesStore.wsReconnectAttempts
    if (attempts >= this.config.wsMaxReconnectAttempts) {
      this.fallbackToPostMode()
      return
    }

    if (attempts === 0) {
      window.$message?.error('WebSocket 建立失败，正在尝试重连。')
    }
    this.nodesStore.updateWsState('reconnecting', attempts + 1)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connectWebSocket(generation)
    }, this.config.wsReconnectInterval)
  }

  private fallbackToPostMode(): void {
    this.useWebSocket = false
    this.clearReconnectTimer()
    const client = this.rpc.getClient()
    client.setTransport(false)
    this.nodesStore.updateWsState('disconnected', this.config.wsMaxReconnectAttempts)
    window.$message?.warning('WebSocket 无法连接，已回落到 HTTP 模式。')
    void this.poll()
  }

  private startPolling(): void {
    this.stopPolling()
    this.pollTimer = setInterval(() => {
      void this.poll()
    }, this.getPollInterval())
  }

  private async poll(): Promise<void> {
    if (this.state !== 'running' || this.isPolling)
      return

    const lifecycleGeneration = this.lifecycleGeneration
    const transportGeneration = this.transportGeneration
    const client = this.rpc.getClient()
    if (this.useWebSocket && client.getWsReadyState() !== WebSocket.OPEN) {
      return
    }

    this.isPolling = true
    try {
      const [clientsResult, statusesResult] = await Promise.allSettled([
        this.rpc.getNodes() as Promise<Record<string, Client>>,
        this.rpc.getNodesLatestStatus() as Promise<Record<string, NodeStatus>>,
      ])
      if (!this.isLifecycleCurrent(lifecycleGeneration)
        || transportGeneration !== this.transportGeneration
        || this.state !== 'running') {
        return
      }

      const failures: unknown[] = []
      let clients: Record<string, Client> | null = null
      let statuses: Record<string, NodeStatus> | null = null

      if (clientsResult.status === 'rejected') {
        failures.push(clientsResult.reason)
      }
      else if (isRecordResponse(clientsResult.value)) {
        clients = clientsResult.value as Record<string, Client>
      }
      else {
        failures.push(new TypeError('common:getNodes returned a non-object result'))
      }

      if (statusesResult.status === 'rejected') {
        failures.push(statusesResult.reason)
      }
      else if (isRecordResponse(statusesResult.value)) {
        statuses = statusesResult.value as Record<string, NodeStatus>
      }
      else {
        failures.push(new TypeError('common:getNodesLatestStatus returned a non-object result'))
      }

      const authenticationFailure = failures.find(error => this.isAuthenticationFailure(error))
      if (authenticationFailure) {
        await this.handleAuthenticationChanged()
        return
      }

      // 两个请求彼此独立：其中一个失败时仍应用另一个成功结果，避免整轮状态冻结。
      if (clients) {
        this.nodesStore.updateNodeClients(clients)
      }
      if (statuses) {
        this.nodesStore.updateNodeStatuses(statuses)
      }

      if (failures.length === 0) {
        this.postFailureCount = 0
        this.appStore.connectionError = false
        return
      }

      failures.forEach(error => console.error('[InitManager] Poll request failed:', error))
      if (failures.every(error => error instanceof RpcTransportError)) {
        this.postFailureCount++
        if (this.postFailureCount >= this.config.postFailureThreshold) {
          this.appStore.connectionError = true
        }
      }
      else {
        this.appStore.connectionError = true
      }
    }
    catch (error) {
      if (!this.isLifecycleCurrent(lifecycleGeneration)
        || transportGeneration !== this.transportGeneration
        || this.state !== 'running') {
        return
      }
      if (this.isAuthenticationFailure(error)) {
        await this.handleAuthenticationChanged()
        return
      }

      console.error('[InitManager] Poll failed:', error)
      if (error instanceof RpcTransportError) {
        this.postFailureCount++
        if (this.postFailureCount >= this.config.postFailureThreshold) {
          this.appStore.connectionError = true
        }
      }
      else {
        this.appStore.connectionError = true
      }
    }
    finally {
      this.isPolling = false
    }
  }

  private isAuthenticationFailure(error: unknown): boolean {
    return isRpcAuthenticationError(error)
      || this.isLegacyPrivateSiteBootstrapError(error)
      || (error instanceof ApiError
        && error.kind === 'unauthenticated'
        && /session|会话/i.test(error.message))
  }

  private startSessionMonitoring(): void {
    this.stopSessionMonitoring()
    this.sessionCheckTimer = setInterval(() => {
      void this.refreshSessionState()
    }, this.config.sessionCheckInterval)
  }

  private async refreshSessionState(): Promise<void> {
    if (this.state !== 'running' || this.isCheckingSession)
      return

    this.isCheckingSession = true
    const observedGeneration = this.lifecycleGeneration
    let transitionGeneration: number | null = null
    try {
      const wasLoggedIn = this.appStore.isLoggedIn
      const previousUserIdentity = this.getUserIdentity(this.appStore.userInfo)
      const previousTransportMode = this.appStore.rpcTransportMode
      const previousPollInterval = this.getPollInterval()
      const context = await this.fetchBootstrapContext()
      if (!this.isLifecycleCurrent(observedGeneration) || this.state !== 'running')
        return

      const authenticationRequired = this.requiresAuthentication(context.publicSettings, context.userInfo)
      const loginChanged = wasLoggedIn !== context.userInfo.logged_in
        || previousUserIdentity !== this.getUserIdentity(context.userInfo)
      if (authenticationRequired || loginChanged) {
        // WebSocket 身份在握手时固定。先关闭旧连接并清空节点，避免旧权限结果回写。
        transitionGeneration = this.beginLifecycleOperation()
        this.stopTransportAndPolling()
        this.nodesStore.clearNodes()
        this.state = 'bootstrapping'
        this.applyBootstrapContext(context)
        if (authenticationRequired) {
          this.enterAwaitingAuthentication()
          return
        }
        await this.finishInitialization(transitionGeneration)
        return
      }

      this.applyBootstrapContext(context)
      if (previousTransportMode !== this.appStore.rpcTransportMode
        || previousPollInterval !== this.getPollInterval()) {
        this.startTransportAndPolling()
      }
    }
    catch (error) {
      console.error('[InitManager] Session validation failed:', error)
      if (this.isAuthenticationFailure(error)) {
        await this.handleAuthenticationChanged()
        return
      }
      if (transitionGeneration !== null && this.isLifecycleCurrent(transitionGeneration)) {
        this.state = 'running'
        this.appStore.loading = false
        this.appStore.connectionError = true
        this.startTransportAndPolling()
      }
    }
    finally {
      this.isCheckingSession = false
    }
  }

  private async handleAuthenticationChanged(): Promise<void> {
    if (this.authTransitionPromise)
      return this.authTransitionPromise

    const transition = this.runAuthenticationTransition()
    this.authTransitionPromise = transition
    try {
      await transition
    }
    finally {
      if (this.authTransitionPromise === transition)
        this.authTransitionPromise = null
    }
  }

  private async runAuthenticationTransition(): Promise<void> {
    const generation = this.beginLifecycleOperation()
    this.stopTransportAndPolling()
    this.nodesStore.clearNodes()
    this.state = 'bootstrapping'
    this.appStore.loading = true

    try {
      const context = await this.fetchBootstrapContext()
      if (!this.isLifecycleCurrent(generation))
        return
      this.applyBootstrapContext(context)
      if (this.requiresAuthentication(context.publicSettings, context.userInfo)) {
        this.enterAwaitingAuthentication()
        return
      }
      await this.finishInitialization(generation)
    }
    catch (error) {
      if (!this.isLifecycleCurrent(generation))
        return
      console.error('[InitManager] Failed to recover authentication state:', error)
      if (this.isAuthenticationFailure(error)) {
        this.enterAwaitingAuthentication()
        return
      }
      this.state = 'running'
      this.appStore.loading = false
      this.appStore.connectionError = true
      this.startTransportAndPolling()
    }
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private stopSessionMonitoring(): void {
    if (this.sessionCheckTimer) {
      clearInterval(this.sessionCheckTimer)
      this.sessionCheckTimer = null
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private stopTransportAndPolling(): void {
    this.transportGeneration++
    this.stopPolling()
    this.stopSessionMonitoring()
    this.clearReconnectTimer()
    this.unsubscribeWsClose?.()
    this.unsubscribeWsError?.()
    this.unsubscribeWsClose = null
    this.unsubscribeWsError = null
    this.rpc.getClient().setTransport(false)
  }

  async reconnectAfterLogin(): Promise<void> {
    if (this.state === 'destroyed')
      return
    if (this.loginReconnectPromise)
      return this.loginReconnectPromise

    const reconnect = this.runLoginReconnect()
    this.loginReconnectPromise = reconnect
    try {
      await reconnect
    }
    finally {
      if (this.loginReconnectPromise === reconnect)
        this.loginReconnectPromise = null
    }
  }

  private async runLoginReconnect(): Promise<void> {
    const generation = this.beginLifecycleOperation()
    this.stopTransportAndPolling()
    this.state = 'bootstrapping'
    this.appStore.loading = true

    try {
      const context = await this.fetchBootstrapContext()
      if (!this.isLifecycleCurrent(generation))
        return
      this.applyBootstrapContext(context)
      if (this.requiresAuthentication(context.publicSettings, context.userInfo) || !context.userInfo.logged_in) {
        throw new ApiError('登录会话未生效', 'error', 401, { kind: 'unauthenticated' })
      }
      await this.finishInitialization(generation)
    }
    catch (error) {
      if (!this.isLifecycleCurrent(generation))
        return
      if (this.isAuthenticationFailure(error)) {
        this.enterAwaitingAuthentication()
        throw error
      }

      console.error('[InitManager] Login succeeded but re-initialization failed:', error)
      this.state = 'running'
      this.appStore.loading = false
      this.appStore.requireLogin = false
      this.appStore.connectionError = true
      this.startTransportAndPolling()
      window.$message?.warning('登录成功，但节点数据暂时加载失败，主题会自动重试。')
    }
  }

  destroy(): void {
    if (this.state === 'destroyed')
      return
    this.beginLifecycleOperation()
    this.state = 'destroyed'
    this.stopTransportAndPolling()
    this.rpc.close()
    this.nodesStore.clearNodes()
    this.loginModalShown = false
  }
}

let initManager: InitManager | null = null

export async function initApp(): Promise<void> {
  if (!initManager) {
    initManager = new InitManager()
  }
  await initManager.init()
}

export function getInitManager(): InitManager | null {
  return initManager
}

export function destroyInitManager(): void {
  if (initManager) {
    initManager.destroy()
    initManager = null
  }
}

export async function reconnectAfterLogin(): Promise<void> {
  if (initManager) {
    await initManager.reconnectAfterLogin()
  }
}
