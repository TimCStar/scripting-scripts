# 验证记录

日期：2026-10-09。测试全部使用虚构账号和模拟网络；没有连接真实 Sub2API，没有实际调用重置。

- Node 24：41 个测试全部通过。
- TypeScript 5.9.3：`model.ts`、`client.ts`、`operations.ts` 严格类型检查通过。
- 全部 7 个 `.ts` / `.tsx` 文件的 TypeScript 语法转译检查通过。
- Scripting 组件、网络、Keychain、Storage、Dialog、Link 与脚本入口对照官方文档检查。
- `.scripting` 为 ZIP，所有脚本入口位于根目录；打包后校验 CRC 和必须文件。
- 静态布局检查覆盖小号单账号、中号 1 / 2 个、大号 1 / 2 / 3 / 4 个。字体、间距已针对紧凑尺寸收缩，但不是设备截图测试。
- 来源 Sub2API v0.2.15，固定提交 `3a6fd1c9db07203ca308aaba69e502bc1f35b307`。

尚未验证：真实 iPhone 的 Scripting 运行、真实 iOS 浅色/深色/着色模式截图、设备同步的官方 `scripting.d.ts` API 类型检查、真实网络连接、真实重置结果。必须先用演示预览，再连接自己的服务器；不要为测试而消耗真实重置券。

手动重置安全测试包括：只读准备；主账号资格；确认过期/身份变化；pending 先写后发；重复点击去重；存储失败不发送；超时/5xx/格式异常不重试；成功但缓存失败仍视为消耗；凭证切换不绕过锁；人工核对后解锁不发请求；拒绝重定向；无请求体/窗口选择参数；仅向配置服务器发请求。

开发复现：

    npm test
    npm install
    npm run typecheck:core
    npm run check:syntax

`npm test` 不需要安装运行时依赖；后两项需要开发依赖 TypeScript。测试程序仅操作自身临时目录和虚构数据。
