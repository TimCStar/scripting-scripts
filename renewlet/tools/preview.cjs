const { harness } = require('./harness.cjs'),
  { render } = require('./render.cjs'),
  fs = require('node:fs'),
  path = require('node:path')
async function main() {
  let groups = []
  for (const mode of ['light', 'dark']) {
    const cards = []
    for (const [family, width, height, title] of [
      ['systemSmall', 155, 155, '01 / SMALL'],
      ['systemMedium', 329, 155, '02 / MEDIUM'],
      ['systemLarge', 329, 345, '03 / LARGE'],
    ]) {
      const h = harness({ family, width, height }),
        m = h.load('model.ts'),
        c = m.defaultConfig(),
        s = m.demoSnapshot(c.zone, new Date('2026-10-10T04:00:00Z'))
      // Stress left alignment and FX typography with varied name lengths.
      s.subscriptions[0] = {
        ...s.subscriptions[0],
        price: '11',
        currency: 'GBP',
        category: 'cloud_storage',
      }
      s.subscriptions[1] = {
        ...s.subscriptions[1],
        name: '云服务 · 家庭共享订阅',
        price: '35.99',
        currency: 'TRY',
        category: 'streaming',
      }
      const v = h.load('widget-view.tsx').WidgetView({
        snapshot: s,
        config: c,
        family,
        date: '2026-10-10',
        width,
        height,
      })
      cards.push(
        `<article><div class="caption">${title}</div><div class="widget" data-theme="${mode}">${render(v, mode)}</div></article>`,
      )
    }
    groups.push(
      `<div class="theme-group"><div class="mode-label">${mode === 'light' ? '浅色 / LIGHT' : '深色 / DARK'}</div><div class="widget-grid">${cards.join('')}</div></div>`,
    )
  }
  const h = harness(),
    m = h.load('model.ts'),
    c = m.defaultConfig()
  const pages = m.demoSnapshot(c.zone)
  pages.subscriptions[0] = {
    ...pages.subscriptions[0],
    currency: 'GBP',
    price: '11',
    category: 'cloud_storage',
  }
  h.data.set('renewlet.demo.v1', pages)
  h.load('index.tsx')
  await h.globals.completion
  const dashboard = h.load('index.tsx').Dashboard(),
    detail = h.load('detail.tsx').Detail({ id: 'demo-0' })
  const css = `
  *{box-sizing:border-box}body{margin:0;background:#e9edf6;color:#20243b;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1080px;margin:auto;padding:42px 32px}.eyebrow{font-size:11px;letter-spacing:3px;color:#5268da}h1{font-size:44px;margin:14px 0 10px;letter-spacing:-1px}.subtitle{color:#69708b;line-height:1.8}.pill{display:inline-block;padding:7px 12px;background:#dfe5fb;border-radius:20px;font-size:11px}.theme-group{margin-top:32px}.mode-label{font-size:11px;letter-spacing:2px;margin-bottom:14px}.widget-grid{display:flex;gap:28px;align-items:flex-start}.caption{font-size:10px;color:#69708b;margin-bottom:10px;letter-spacing:1px}.widget{border-radius:24px;overflow:hidden;box-shadow:0 12px 32px #20243b14;flex-shrink:0}.vstack{display:flex;flex-direction:column;align-items:center;min-width:0;flex-shrink:0}.hstack{display:flex;align-items:center;min-width:0;width:100%;flex-shrink:0}.text{display:block;line-height:1.18;min-width:0}.spacer{flex:1;min-width:0;min-height:0}.symbol{display:flex;align-items:center;justify-content:center;flex-shrink:0}.link{display:flex;flex-direction:column;color:inherit;text-decoration:none;min-width:0}.meter{height:3px;border-radius:4px;background:#a0a8c626;width:100%;overflow:hidden;flex-shrink:0}.meter i{display:block;height:100%;border-radius:4px}.native-button{border:0;background:none;color:#5268da;font:inherit}.phones{display:flex;gap:30px;margin-top:28px}.phone{width:390px;height:700px;overflow:auto;border-radius:30px;border:6px solid #20243b;scrollbar-width:none;background:#f0f2f9}.phone[data-theme=dark]{background:#11172a;color:#eef0ff}.native-page{padding:16px 12px}.native-page nav{font-size:17px;font-weight:600;display:flex;justify-content:space-between;margin:4px 4px 18px}.native-page nav span{font-size:11px;color:#5268da}.native-page section{margin-bottom:14px}.section-title{padding:7px 5px;font-size:11px;color:#69708b}.section-body{background:white;border-radius:17px;padding:14px;display:flex;flex-direction:column;gap:12px}.phone[data-theme=dark] .section-body{background:#1a2035}.section-body>.link{width:100%}.search{background:#f0f2f9;border:0;width:100%;padding:12px;border-radius:10px;font:inherit}.picker{display:flex;flex-wrap:wrap;background:#edf0fe;padding:3px;border-radius:9px;gap:3px}.picker>span{flex:1;white-space:nowrap;text-align:center;padding:7px 2px;font-size:10px;border-radius:7px}.picker .active{background:white;box-shadow:0 1px 4px #0001}.footnote{font-size:12px;line-height:1.8;color:#69708b;margin-top:25px}@media(max-width:920px){.widget-grid,.phones{flex-wrap:wrap}main{padding:30px 20px}}
  `
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renewlet 续订手札 · 设计预览</title><style>${css}</style><main><div class="eyebrow">RENEWLET × SCRIPTING</div><h1>订阅与到期日期</h1><p class="subtitle">小、中、大组件 · 订阅图标 · 金额与日期 · 自动适配深浅色</p><div class="pill">实际 TSX 视图树 · 虚构演示 · 浏览器近似，非 iOS 截图</div>${groups.join('')}<div class="mode-label" style="margin-top:36px">COLLECTION & DETAIL / 全部订阅与详情</div><div class="phones"><div class="phone">${render(dashboard, 'light')}</div><div class="phone" data-theme="dark">${render(detail, 'dark')}</div></div><p class="footnote">此页面仅用于审阅布局、内容与深浅色配色。SF Symbols、字体、系统边距、自适应字号和点击交互以 iPhone 实机为准。演示不连接服务器。</p></main></html>`
  fs.mkdirSync(path.join(__dirname, '../assets'), { recursive: true })
  fs.writeFileSync(path.join(__dirname, '../assets/design-preview.html'), html)
  console.log('Generated preview from actual TSX view trees.')
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
