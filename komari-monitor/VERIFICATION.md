# 验证记录

版本 **1.1.4**；日期 **2026-10-10**。自动网络测试使用虚构数据与模拟响应；另外只读核对了用户提供的公开部署首页、公开元信息与 favicon，没有读取或提交真实 VPS 数据。

## 已执行

- Node **24.14.0**，`npm test`：59 项测试通过，包含数据与接口测试、独立 Widget／App Intent 桥接执行、七种尺寸／节点数的视图树检查、总览／详情入口检查和离开页面停止轮询。包括旧图标失败缓存迁移、218 KB 图标读取与缓存、失败重试／已有图标保留，中号有限／无限额度的流量轨道结构，以及鉴权／HTTP／JSON 错误可见、原生请求与正文挂起超时、迟到结果隔离、图标挂起不阻塞监控、监听缺失、意外异常、总览／详情错误入口、原生出现回调缺失后的手动恢复。
- 1.1.4 核对 Komari `common.go` 的最近一小时 `pingStat.avg/loss` 计算，新增任务等权均值、任务顺序不影响结果、缺失／真实 0／全丢包／非法缓存值测试；桥接确认全部七种组件布局、总览两种密度卡片及详情顶部均显示相同的平均延迟与平均丢包率。详情独立任务统计与曲线保留。未改动布局 API，未重做浏览器像素检查，实机尚未验证。
- 1.1.3 将测试桥接的 `AppEvents` 从全局移至 `scripting` 模块导出，重现旧源码的监听错误，再补上导入使回归通过。新增无全局 `AppEvents` 情况下的加载、后台暂停、前台恢复和卸载清理检查；真正缺失 API 时仍自动读取且不提示必须更新 App。核对官方 [App Events](https://scriptingapp.github.io/guide/Utilities/App%20Events) 管理器签名与 [Quick Start](https://scriptingapp.github.io/guide/Quick%20Start) 模块导入规范，并用 [AppRoot.tsx 固定提交](https://github.com/StarYunLee/Scripting/blob/f9bea4895218b7ca40c068927b012dccc2bf1d60/AI%20Usage/components/AppRoot.tsx) 的显式导入交叉核对。未改变布局，未重新进行浏览器像素检查。
- TypeScript **5.9.3**，`npm run typecheck:core`：`model.ts`、`client.ts` 严格类型检查通过。
- `npm run check`：10 个运行时 `.ts` / `.tsx` 文件的语法诊断通过，`script.json` 必需字段通过。
- `.scripting` 与源码 ZIP 打包后重新解压，所有文件逐字节对照源码一致；SHA-256、文件数和大小保存在 `dist/checksums.json`。安装包文件直接位于 ZIP 根目录。
- Playwright／Edge 对实际 TSX 生成的 **HTML 布局近似**截图检查：全部七种尺寸／节点数组合的浅深色预览；155×155、329×155、329×345 点模拟尺寸。重构字号、顶部靠左与可用高度分配后，指标没有与页脚重叠；长节点名单行省略，小号及中号指标没有截断。中号有限额度与无限额度两列的流量轨道纵坐标相同，大号三台的最后一台占整行。总览、详情及组件流量区域没有独立绿色底板。此结果不代表 SwiftUI 原生布局结果。
- 公开站点标题来自首页及 `/api/public`；`/favicon.ico` 返回 222845 字节、1024×1024 PNG，虽 MIME 为 `image/vnd.microsoft.icon`，文件本身是 PNG。旧版 128 KB 限制会跳过该文件；新版限制为 2 MB。只检查了文件与请求门槛，原生 UIImage 解码仍需在 iPhone 上确认。
- 1.1.2 使用 Playwright／Edge 检查更大字号与纯圆点状态：七种节点数组合、浅深色、原有尺寸及 170×170／364×170／364×382 模拟尺寸。默认组合另检查旧快照提示占用一行的情况；没有指标与页脚重叠。CPU／内存／磁盘对齐卡片左边、中间及右边。大尺寸仅为布局样本，不宣称与用户手机尺寸一致。
- 公开部署只读 `common:getPublicInfo` HTTP RPC 烟测：HTTP 200、JSON-RPC 2.0、响应 ID 匹配，站点标题正确；没有读取节点列表或状态。此结果不能证明 iPhone 的网络／运行时正常。

## 测试覆盖

真实 0 与未知读数；非有限／负值／字符串数值；扁平 RPC 和嵌套 REST；TCP 总连接数减去 UDP；字段白名单；HTTPS 地址、部署前缀、凭证／端口／路径编码；UUID 顺序、去重、尺寸限制、无效与不可见节点不替换；权威在线／离线、旧版近期上报、过期、未来时间和缓存降级；分组历史、排序、去重、保留缺失数据及全窗口等距降采样；额度遵循上报累计计量和全部五种方式；历史增量不能当周期总量；探测失败与真实 0、窗口汇总不受曲线抽样影响。

网络覆盖只读 RPC 方法、`maxCount` 正确拼写、拒绝重定向、Bearer Header、8 秒请求超时、HTTP 404 降级、HTTP 5xx 和鉴权失败不降级、RPC ID 校验、旧版并发上限 4、单节点失败隔离。状态覆盖缓存保留原成功时间、凭证站点绑定、配置切换丢弃结果、同宿主重复刷新共享请求、无效参数不联网、存储失败提示；3 秒状态请求不重读清单，后台暂停和恢复、失败退避、标题和缓存图标替换、图标无 Authorization 且不随状态请求重复获取；以及 App Intent 过期参数不发请求／刷新后 reload。

## 官方资料核对

Scripting 官方 `llms.txt` 对应 API 页：Quick Start／hooks、Script、Navigation.present／useDismiss、NavigationLink、页面 toolbar、List／Section／Form、生命周期、AppEvents.scenePhase、Status Bar & System Overlays 中的 fullScreen 示例、刷新、Text／Image／UIImage／Data／Response、HStack／VStack、frame／padding、动态 foregroundStyle／background、ShapeStyle／widgetBackground、ProgressView、Picker／Toggle、TextField／SecureField、Chart／LineChart、Widget API、AppIntent、Keychain、Storage、fetch／RequestInit（timeout 秒数、AbortError、AbortController／signal）及 useEffect 清理。

开发指南固定提交：`2991c41f42be9e50d3080c5af34315e68ebb3d86`。

Komari 固定提交：`e48aa1e76931132fb5dc93ce53763dd59df83d9f`；核对 `web/router/router.go`、`web/rpc/jsonrpc/common.go`、`common.record.go`、`public.go`、`database/models/models.go`、`protocol/v2/jsonrpc.go` 和鉴权／WebSocket 文件。

Emerald 参考提交：`9f9a076df2bc680ddd8c42b6d921a96beec5ea90`。仅参考信息分层；其 SDK 的 `max_count` 与后端源码的 `maxCount` 不一致，后端 grouped records 也不能按 SDK 简化数组形状直接处理。本实现以 Komari 后端源码为准。

## 尚未验证

没有真实 iPhone／Scripting 执行、当前设备同步的官方 `scripting.d.ts`、真实 VPS 数据与持续更新、原生图标解码、iOS 主屏幕刷新／链接／App Intent、着色模式或系统字体放大验证。不使用虚构 host 声明声称完整 API 类型检查。自动测试与浏览器预览都不能替代这些验证。

实机最短检查：

1. 导入 `.scripting`，保留演示模式，预览小／中／大；中号分别选择 1、2 台，大号分别选择 1–4 台。
2. 系统切换浅色和深色，检查名称、水位、曲线与采样时间；在主屏幕确认 155 点等较小宿主没有裁切。
3. 添加实际主屏幕组件。小号点入全部监控；中大号点节点入详情、点顶部／底部入全部；测试刷新按钮。
4. 连接自己的公开站点或私有站点 API Key；确认节点清单、资源、在线状态、1／6／24 小时曲线与网页一致。
5. 核对站点标题／图标和累计流量额度；配置多个探测任务，检查各任务延迟、失败断点和窗口丢包率。确认全屏展示。
6. 前台观察数次自动更新，退到后台再返回，检查恢复更新。断网刷新：应保留旧值并显示「旧快照」，不能继续宣称当前在线。恢复网络后刷新。
7. 在总览和详情之间切换、离开页面：确认轮询停止，无重复刷新。参数填无效 UUID 时应明确提示重新选择。

需要设备 API 类型检查时，使用官方 `scripting-cli` 同步声明文件，再以该 app 版本检查全部 TSX。没有为本任务启动需要 iPhone 配对的服务。
