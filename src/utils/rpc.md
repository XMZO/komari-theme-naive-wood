# Komari RPC2 客户端

`rpc.ts` 是主题使用的 JSON-RPC 2.0 客户端，支持 HTTP POST 与 WebSocket。主题运行时统一复用 `getSharedRpc()`，不要为组件各自创建连接。

## 基本用法

```ts
import { getSharedRpc } from '@/utils/rpc'

const rpc = getSharedRpc()
const nodes = await rpc.getNodes()
const status = await rpc.getNodesLatestStatus()
```

默认端点由 `VITE_API_BASE` 派生：

- HTTP/WS RPC：`<VITE_API_BASE>/rpc2`
- 未设置时：`/api/rpc2`
- HTTP 请求使用 `credentials: 'include'`

## RPC 内置方法

Komari 注册的名称是：

- `rpc.ping`
- `rpc.methods`
- `rpc.help`
- `rpc.version`

`rpc.getMethods`、`rpc.getHelp`、`rpc.getVersion` 不是 Komari 的官方方法名，客户端不应调用。

```ts
await rpc.ping()
await rpc.getMethods(true)
await rpc.getHelp('common:getNodes')
await rpc.getProtocolVersion()
```

`rpc.help` 在指定方法时返回一个 `MethodMeta`，未指定时返回数组。元数据可能包含 `params[].required` 与 `example`。

## 节点与版本

```ts
const version = await rpc.getVersion()
const nodes = await rpc.getNodes()
const latest = await rpc.getNodesLatestStatus()
const recent = await rpc.getNodeRecentStatus(uuid)
```

- 服务端版本优先调用 `public:getVersion`，仅在方法不存在时回退 `common:getVersion`。
- `common:getBackendVersion` 不存在。
- `common:getNodes` 返回以 UUID 为键的对象。
- `common:getNodesLatestStatus` 返回以 UUID 为键的对象。
- `common:getNodeRecentStatus` 只接受 `uuid`，没有有效的 `limit` 参数。
- 最新/最近状态的 `connections` 是 TCP + UDP，主题展示 TCP 时必须减去 `connections_udp`。
- 历史 `Record.connections` 已经是 TCP，不应再次减 UDP。
- `expired_at` 可能为 `null`，`public_remark` 可能缺失。

## 新指标接口与旧版回退

Komari 1.2.6 起提供：

```ts
const definitions = await rpc.listMetricDefinitions()

const result = await rpc.queryMetrics({
  metric_keys: ['cpu.usage', 'memory.used'],
  entity_id: uuid,
  hours: 24,
  downsample: true,
  fill_empty: true,
  max_points: 600,
  aggregation: 'avg',
})

const ping = await rpc.getPingMetricStats({
  entity_id: uuid,
  hours: 24,
  max_points: 600,
})
```

兼容规则：

- 只有 JSON-RPC `-32601 Method not found` 才表示能力不存在并允许回退。
- 网络、鉴权、数据库或参数错误不能被旧接口掩盖。
- `retention_days = 0` 表示该指标历史记录已关闭。
- `queryMetrics` 的点值可能为 `null`，不能转换成 `0`。
- 使用服务端返回的 `interval_seconds`，新路径不再执行客户端二次降采样。
- Ping 延迟指标是 `ping.latency_ms`，丢包指标是 `ping.loss`。
- Ping 统计字段可能为 `null`，并可能带 `loss_approximate`。

Komari 1.2.5 及更旧版本缺少指标方法时，主题才回退到 `common:getRecords` 或兼容 REST 记录接口。

## 历史记录兼容方法

```ts
await rpc.getLoadRecords(uuid, 24, undefined, 500)
await rpc.getPingRecords(taskId, 24, 500)
```

注意：

- `common:getRecords` 的数量参数是 `maxCount`，不是 `max_count`。
- load 响应的 `records` 是 `Record<string, StatusRecord[]>`。
- 这些方法主要用于旧版回退；新版主题页面优先使用指标接口。

## WebSocket 生命周期

```ts
const client = rpc.getClient()

client.setTransport(true)
await client.ensureWebSocketConnectedWithPing(10_000)

const unsubscribe = client.onWebSocketClose(() => {
  // 更新连接状态或安排重连
})

unsubscribe()
client.setTransport(false)
```

不要覆盖客户端内部的 `onclose` / `onerror`。客户端会：

- 限制握手和请求总时长；
- 断线时拒绝当前 socket 的 pending 请求；
- 忽略旧 socket 的迟到关闭事件；
- 在主动切换到 HTTP 或关闭时停止使用 WebSocket。

Komari 在 WebSocket 握手时固定调用者身份。登录态变化后必须关闭旧连接，再以新会话重连。

## 错误分类

```ts
import {
  isRpcAuthenticationError,
  isRpcMethodUnavailable,
  RpcError,
  RpcTransportError,
} from '@/utils/rpc'
```

- `RpcError`：服务端 JSON-RPC 业务错误。
- `RpcTransportError`：网络、HTTP、协议、超时或连接关闭错误。
- `isRpcMethodUnavailable()`：只判断方法不存在。
- `isRpcAuthenticationError()`：识别 401、`-32040`，以及明确提示 private/login 的 `-32041`；普通权限错误不会被误判为登录失效。

## 验证

仓库没有测试套件。修改此客户端后至少运行：

```powershell
pnpm lint
pnpm build
```
