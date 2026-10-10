# 验证记录

版本 **1.1.0**；日期 **2026-10-10**。全部网络测试使用虚构数据与模拟响应，没有读取用户 VPS，没有连接真实 Komari 部署。

## 已执行

- Node **24.14.0**，`npm test`：41 项测试通过，包含数据与接口测试、独立 Widget／App Intent 桥接执行、七种尺寸／节点数的视图树检查、总览／详情入口检查和离开页面停止轮询。
- TypeScript **5.9.3**，`npm run typecheck:core`：`model.ts`、`client.ts` 严格类型检查通过。
- `npm run check`：10 个运行时 `.ts` / `.tsx` 文件的语法诊断通过，`script.json` 必需字段通过。
- `.scripting` 与源码 ZIP 打包后重新解压，所有文件逐字节对照源码一致；SHA-256、文件数和大小保存在 `dist/checksums.json`。安装包文件直接位于 ZIP 根目录。
- Playwright／Edge 对实际 TSX 生成的 **HTML 布局近似**截图检查：浅／深两套、小号 1 台、中号 2 台、大号 4 台；155×155、329×155、329×345 点模拟尺寸。紧凑名称布局与小号间距修正后，全部七种尺寸／节点数组合的浅深色预览，无指标越过组件边界或与页脚重叠；长节点名按单行省略，小号及中号指标没有截断。额外修正中号单台曲线与大号单台页脚重叠。总览和详情也检查浅深色。此结果不代表 SwiftUI 原生布局结果。

## 测试覆盖

真实 0 与未知读数；非有限／负值／字符串数值；扁平 RPC 和嵌套 REST；TCP 总连接数减去 UDP；字段白名单；HTTPS 地址、部署前缀、凭证／端口／路径编码；UUID 顺序、去重、尺寸限制、无效与不可见节点不替换；权威在线／离线、旧版近期上报、过期、未来时间和缓存降级；分组历史、排序、去重、保留缺失数据及全窗口等距降采样；额度遵循上报累计计量和全部五种方式；历史增量不能当周期总量；探测失败与真实 0、窗口汇总不受曲线抽样影响。

网络覆盖只读 RPC 方法、`maxCount` 正确拼写、拒绝重定向、Bearer Header、8 秒请求超时、HTTP 404 降级、HTTP 5xx 和鉴权失败不降级、RPC ID 校验、旧版并发上限 4、单节点失败隔离。状态覆盖缓存保留原成功时间、凭证站点绑定、配置切换丢弃结果、同宿主重复刷新共享请求、无效参数不联网、存储失败提示；3 秒状态请求不重读清单，后台暂停和恢复、失败退避、标题和缓存图标替换、图标无 Authorization 且不随状态请求重复获取；以及 App Intent 过期参数不发请求／刷新后 reload。

## 官方资料核对

Scripting 官方 `llms.txt` 对应 API 页：Quick Start／hooks、Script、Navigation.present／useDismiss、NavigationLink、页面 toolbar、List／Section／Form、生命周期、AppEvents.scenePhase、Status Bar & System Overlays 中的 fullScreen 示例、刷新、Text／Image／UIImage／Data／Response、HStack／VStack、frame／padding、动态 foregroundStyle／background、ShapeStyle／widgetBackground、ProgressView、Picker／Toggle、TextField／SecureField、Chart／LineChart、Widget API、AppIntent、Keychain、Storage、fetch／RequestInit。

开发指南固定提交：`2991c41f42be9e50d3080c5af34315e68ebb3d86`。

Komari 固定提交：`e48aa1e76931132fb5dc93ce53763dd59df83d9f`；核对 `web/router/router.go`、`web/rpc/jsonrpc/common.go`、`common.record.go`、`public.go`、`database/models/models.go`、`protocol/v2/jsonrpc.go` 和鉴权／WebSocket 文件。

Emerald 参考提交：`9f9a076df2bc680ddd8c42b6d921a96beec5ea90`。仅参考信息分层；其 SDK 的 `max_count` 与后端源码的 `maxCount` 不一致，后端 grouped records 也不能按 SDK 简化数组形状直接处理。本实现以 Komari 后端源码为准。

## 尚未验证

没有真实 iPhone／Scripting 执行、当前设备同步的官方 `scripting.d.ts`、真实服务器连接、iOS 主屏幕刷新／链接／App Intent、着色模式或系统字体放大验证。不使用虚构 host 声明声称完整 API 类型检查。自动测试与浏览器预览都不能替代这些验证。

实机最短检查：

1. 导入 `.scripting`，保留演示模式，预览小／中／大；中号分别选择 1、2 台，大号分别选择 1–4 台。
2. 系统切换浅色和深色，检查名称、水位、曲线与采样时间；在主屏幕确认 155 点等较小宿主没有裁切。
3. 添加实际主屏幕组件。小号点入全部监控；中大号点节点入详情、点顶部／底部入全部；测试刷新按钮。
4. 连接自己的公开站点或私有站点 API Key；确认节点清单、资源、在线状态、1／6／24 小时曲线与网页一致。
5. 核对站点标题／图标和累计流量额度；配置多个探测任务，检查各任务延迟、失败断点和窗口丢包率。确认全屏展示。
6. 前台观察数次自动更新，退到后台再返回，检查恢复更新。断网刷新：应保留旧值并显示「旧快照」，不能继续宣称当前在线。恢复网络后刷新。
7. 在总览和详情之间切换、离开页面：确认轮询停止，无重复刷新。参数填无效 UUID 时应明确提示重新选择。

需要设备 API 类型检查时，使用官方 `scripting-cli` 同步声明文件，再以该 app 版本检查全部 TSX。没有为本任务启动需要 iPhone 配对的服务。
