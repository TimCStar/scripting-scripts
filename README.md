# Scripting 脚本仓库

个人 iOS Scripting 脚本合集。每个脚本独立放在一个目录，包含源码、使用说明、测试和可导入安装包，方便后续继续添加。

## 脚本目录

### [Sub2API 用量看板](sub2api-monitor/README.md)

中文主屏幕小组件与手动确认重置面板，支持小、中、大号组件与多账号布局。首次运行默认使用明确标记的虚构演示数据。

- [导入安装包](sub2api-monitor/dist/Sub2API-Monitor.scripting)：在 GitHub 文件页面下载原始文件，再在 iPhone 通过「分享 → Scripting」导入。
- [安装、配置与安全说明](sub2api-monitor/README.md)
- [源码压缩包](sub2api-monitor/dist/Sub2API-Monitor-source.zip)
- [验证记录与未验证项目](sub2api-monitor/VERIFICATION.md)

自动测试和静态检查已通过；尚未完成真实 iPhone、真实服务器连接与真实重置验证。不要为了测试而消耗真实重置券。

## 仓库约定

- 每个脚本使用独立目录，说明入口为该目录下的 `README.md`。
- 安装包与分发文件放入脚本自己的 `dist/`。
- 不提交服务器凭证、API Key、JWT、本机 Keychain/Storage 导出或真实账号数据。
- 新增脚本时同步更新本目录页。
