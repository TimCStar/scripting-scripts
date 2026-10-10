# Scripting 脚本仓库

个人 iOS Scripting 脚本合集。每个脚本独立放在一个目录，包含源码、使用说明、测试和可导入安装包，方便后续继续添加。

## 脚本目录

### [Renewlet 续订手札](renewlet/README.md)

Renewlet 订阅账本：小、中、大组件展示订阅图标、金额、即将续订／试用结束／权益到期的信息；打开为全部订阅，排序记忆上次选择，可查看详情、添加与编辑。原生深浅色配色，支持只读 Public API Token 与可写登录会话，包含分币种近期标价汇总、逾期待确认与演示账本。

- [导入安装包](renewlet/dist/Renewlet.scripting)：下载原始文件，在 iPhone「分享 → Scripting」导入。
- [安装与连接说明](renewlet/README.md)
- [完整源码包](renewlet/dist/Renewlet-source.zip)
- [设计预览](renewlet/assets/design-preview.png)：实际 TSX 生成的浏览器近似，非 iOS 截图。
- [验证记录](renewlet/VERIFICATION.md)

自动测试、核心类型检查与浏览器布局检查通过；官方公开演示站登录／读取／退出验证通过。真实 iPhone / Scripting 和用户站点的真实订阅写入尚未验证。Turnstile / Passkey 登录可使用只读 Token 与网页管理。

### [Sub2API 用量看板](sub2api-monitor/README.md)

中文主屏幕小组件与手动确认重置面板，支持小、中、大号组件与多账号布局。首次运行默认使用明确标记的虚构演示数据。

- [导入安装包](sub2api-monitor/dist/Sub2API-Monitor.scripting)：在 GitHub 文件页面下载原始文件，再在 iPhone 通过「分享 → Scripting」导入。
- [安装、配置与安全说明](sub2api-monitor/README.md)
- [源码压缩包](sub2api-monitor/dist/Sub2API-Monitor-source.zip)
- [验证记录与未验证项目](sub2api-monitor/VERIFICATION.md)

自动测试和静态检查已通过；尚未完成真实 iPhone、真实服务器连接与真实重置验证。不要为了测试而消耗真实重置券。

### [Komari 夜航](komari-monitor/README.md)

Komari VPS 监控：小、中、大号主屏幕组件显示选中的 VPS；打开脚本进入全部节点总览，支持搜索、分组、状态筛选和逐台详情。全屏深浅色界面，前台约 3 秒持续更新；包含资源水位、流量额度、延迟／丢包率、网速、历史曲线与机器档案。小组件品牌自动跟随站点标题和图标。

- [导入安装包](komari-monitor/dist/Komari-Nightflight.scripting)：下载原始文件，在 iPhone「分享 → Scripting」导入。
- [安装与使用说明](komari-monitor/README.md)
- [源码压缩包](komari-monitor/dist/Komari-Nightflight-source.zip)
- [设计预览](komari-monitor/assets/design-preview.png)：由 TSX 生成的浏览器近似，非 iOS 截图。
- [验证记录](komari-monitor/VERIFICATION.md)

默认展示明确标记的虚构演示数据。自动测试与核心类型检查通过，已核对公开站点标题与图标文件；真实 iPhone／Scripting、真实 VPS 数据与持续更新尚未验证。

## 仓库约定

- 每个脚本使用独立目录，说明入口为该目录下的 `README.md`。
- 安装包与分发文件放入脚本自己的 `dist/`。
- 不提交服务器凭证、API Key、JWT、本机 Keychain/Storage 导出或真实账号数据。
- 新增脚本时同步更新本目录页。
