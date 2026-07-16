# Komari 新版本兼容性整改清单

## 审计基线

- 主题仓库：`komari-theme-naive-wood`
- 开始整改的主题提交：`f445fe9`（清单版本 `2.0.25`）
- 兼容整改首发版本：`2.0.26`
- 短窗口折线修复版本：`2.0.27`
- 当前 Komari：`Snapshot-2607152341`，提交 `43547b9`
- 兼容目标：Komari `1.2.5`、`1.2.6` 与当前 Snapshot
- 主题仍使用 Vue 3 + Vite + Naive UI，发布包结构不变

## 结论

Komari 没有删除主题依赖的全部旧接口。主要兼容问题来自：

- 私有站点初始化和会话变化；
- WebSocket 身份与生命周期；
- 按指标独立 retention；
- 新指标查询的 null、降采样和 Ping 丢包语义；
- 节点 DTO 新增或可空字段。

主题现在采用“能力检测”而不是“猜版本”：

- 新版优先使用 `public:listMetricDefinitions`、`public:queryMetrics`、`public:getPingMetricStats`。
- 只有服务端明确返回 JSON-RPC `-32601 Method not found` 时才回退旧接口。
- 网络、鉴权、数据库和参数错误不会被旧接口静默掩盖。
- Komari 1.2.5 没有新指标方法，会使用旧记录兼容路径。

## 已完成：鉴权与初始化

- [x] 初始化先读取 `/api/public` 和 `/api/me`，不再先用 `rpc.ping` 判断私有站点。
- [x] 私有站点未登录时立即终止节点、轮询和 WebSocket 初始化。
- [x] 登录后验证 `/api/me.logged_in`，不只相信 `/api/login` 成功响应。
- [x] 兼容明确的 HTTP 401、RPC `-32040` 和带 private/login 提示的 `-32041`。
- [x] 普通权限或敏感操作错误不会被误判为登录失效。
- [x] 兼容 1.2.5 私有站点把 `/api/public`、`/api/me` 也拦成 401 的行为。
- [x] 旧版登录页配置未知时同时保留密码和 OAuth 入口。
- [x] 密码登录被禁用时不显示密码表单；OAuth 使用统一 API base。
- [x] 修复 OAuth-only 页面误显示 OTP 表单的问题。
- [x] 分别提示用户名密码错误、验证码错误、网络错误、超时和 Cookie/会话未生效。
- [x] 强制登录与普通登录都等待重新初始化完成，并使用 single-flight 防止重复重建。
- [x] 登录后的节点加载暂时失败时恢复轮询并自动重试，不再把它误报成密码错误。

## 已完成：WebSocket 与异步生命周期

- [x] 外部使用订阅回调，不再覆盖 `RpcClient` 内部 `onclose` / `onerror`。
- [x] 当前 socket 关闭时立即拒绝并清理 pending 请求。
- [x] 旧 socket 的迟到 close/error 不会清理新连接或触发错误重连。
- [x] WebSocket 握手和响应共用总 deadline，不再出现半开连接无限等待。
- [x] `send()` 同步失败会清理 pending 请求。
- [x] 登录态变化时先关闭旧 WebSocket、清空节点，再按新身份拉取数据。
- [x] 每轮初始化、登录恢复、轮询和会话检查都有 generation 校验，旧请求不能回写新状态。
- [x] poll、session check、WS 鉴权失败共用认证恢复 single-flight。
- [x] 停止或销毁后，尚未完成的旧请求不会重新填充节点。
- [x] 新 transport 生命周期重置重连与 HTTP 失败计数。
- [x] 运行中修改 `rpcTransportMode` 或轮询间隔后会重建 transport。

## 已完成：逐指标 retention 与负载图

- [x] 接入 `public:listMetricDefinitions`，按每个 metric 的 `retention_days` 判断能力。
- [x] `retention_days = 0` 保持为“历史关闭”，不再被 `||` 默认值覆盖。
- [x] 新版时间选择器使用相关可见指标的共同完整窗口。
- [x] 某个指标关闭时，对应历史卡片保持不可用，不绕回旧接口读取陈旧数据。
- [x] 负载历史迁移到 `public:queryMetrics`。
- [x] CPU、内存、Swap、负载、磁盘、网络、进程、TCP、UDP 使用正确 metric key。
- [x] total 类型指标按 `last` 聚合，其余主要曲线按 `avg` 聚合。
- [x] 使用服务端 `interval_seconds` 控制时间轴密度。
- [x] 负载查询点数跟随后端每分钟历史写入周期，避免 4 小时视图被过细空桶切成孤立点。
- [x] 新指标路径不再调用客户端固定网格做二次降采样。
- [x] `null` 保持为空洞，不再转成数值 0。
- [x] 修复旧版 `fillMissingTimePoints()` 重复复用同一个数据点的问题。
- [x] 实时/最近状态的 TCP 统一为 `max(0, connections - connections_udp)`。
- [x] 历史 `Record.connections` 已是 TCP，不重复相减。

## 已完成：Ping 图表

- [x] 曲线迁移到 `public:queryMetrics`。
- [x] 统计迁移到 `public:getPingMetricStats`。
- [x] 使用 `ping.latency_ms` 与 `ping.loss`，按 `task_id` 拆分。
- [x] `ping.latency_ms` retention 为 0 时关闭整个 Ping 历史视图。
- [x] `ping.loss` retention 为 0 时仍显示延迟，并使用后端近似丢包统计。
- [x] 支持 nullable min/max/avg/latest/p50/p99/stddev。
- [x] 支持并明确标注 `loss_approximate`。
- [x] 用 loss 修正包含 `-1` 丢包样本的分桶平均延迟。
- [x] 不插值丢包或缺失区间，峰值裁剪也不会跨空洞补线。
- [x] Ping 查询点数跟随最慢任务间隔，避免 1h/6h/12h/1d 的有效点被空桶完全隔开。
- [x] 同时读取 `public:getPublicPingTasks`，保留后台任务顺序和无数据任务。
- [x] 无数据任务显示未知丢包率，不再显示成 0% 丢包。
- [x] 新指标方法不存在时回退 `common:getRecords`。

## 已完成：DTO、设置与 SDK

- [x] 增加可选 `cpu_physical_cores`，详情页区分物理核与逻辑线程。
- [x] `expired_at` 支持 `null`，无到期时间时不再误显示“已过期”。
- [x] `public_remark` 支持缺失并在 store 中规范化为空字符串。
- [x] 实时状态更新 `ram_total`、`swap_total`、`disk_total`，并保留合法零值。
- [x] 补充 latest status 的 `ping` 类型和历史 `traffic_up` / `traffic_down` 类型。
- [x] 同步 `cors_origin_check_enabled`、`visitor_audit_enabled`；不依赖临时字段 `metric_retention_days`。
- [x] 接入 best-effort visitor audit：`page_view`、`node_open`。
- [x] visitor audit 不上传 query、hash、搜索词或 `temp_key`。
- [x] 审计方法不存在时使用限时能力缓存，不影响页面主流程。
- [x] 修正 `rpc.methods`、`rpc.help`、`rpc.version`。
- [x] 删除不存在的 `common:getBackendVersion` 回退。
- [x] `common:getRecords` 使用 `maxCount`，修正 load 分组返回类型。
- [x] 删除未使用且会主动关闭后错误重连的旧 `RealtimeWebSocket` 客户端。
- [x] 更新 `src/utils/rpc.md`，与当前 SDK 和接口语义一致。

## 上游已确认但主题不应依赖的兼容问题

- Komari 1.2.6 的公开 `metric_retention_days` 可能仍为旧的 90 天，而逐指标 retention 已是 7 天；当前 Snapshot 已删除该临时字段。
- 1.2.6 的兼容公开记录接口中，`load_type=gpu` 校验列表漏项。
- 1.2.6 的兼容投影字段 `connections_tcp` 错误执行了 `TCP - UDP`；主题不使用该投影字段。
- `metric_downsampling_enabled` 是后端存储策略，不是主题保留期来源；主题以 definitions 和查询响应为准。

## 验证结果

- [x] `pnpm exec vue-tsc --noEmit -p tsconfig.app.json`
- [x] `pnpm lint`
- [x] `pnpm build`
- [x] 生成 `komari-theme-naive-build-f445fe9.zip`
- [x] Komari 1.2.6 的 `public.metric.go` blob 与当前 `43547b9` 完全相同：`447c6666b0214b91c6eb2526ab1055a0bfb0f2a7`
- [x] Komari 1.2.5 不存在三个新指标方法，旧版回退条件成立。
- [x] 在实际 1.2.6 面板只读验证 definitions：负载与 Ping 相关指标 retention 均为 7 天，而旧公开汇总仍错误显示 90 天。
- [x] 在实际 1.2.6 面板只读验证 load query：返回 `interval_seconds=300`、`downsampled=true`，point 含 `count/time/value`。
- [x] 在实际 1.2.6 面板只读验证 Ping query：每个 series 同时带 `tag.task_id` 与 `tags.task_id`，空桶为 `null`，loss 为 0~1。
- [x] 在实际 1.2.6 面板只读验证 Ping stats：`task_id` 为字符串，统计字段和任务接口结构与主题类型一致。
- [x] 在实际 1.2.6 面板复现并验证短窗口采样：负载 4h 从 15 秒孤立桶调整为 60 秒连续桶，Ping 1h 从 5 秒孤立桶调整为 300 秒任务桶。

## 发布前人工回归

- [ ] 公共站点 HTTP 模式浏览器回归
- [ ] 公共站点 WebSocket 模式浏览器回归
- [ ] 私有站点未登录、密码登录、OAuth 和 2FA 浏览器回归
- [ ] retention 为 0 与不同指标 retention 的管理面板回归
- [ ] 后端重启后的 WebSocket 重连回归

以上人工项需要在安装新构建包的实际面板中操作；源码、类型、lint、打包以及 1.2.6 真实接口契约验证均已完成。
