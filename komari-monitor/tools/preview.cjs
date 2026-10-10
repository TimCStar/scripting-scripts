// Faithful content/structure from the actual TSX bridge; browser layout is an approximation.
const { harness } = require('./harness.cjs'),
  fs = require('node:fs'),
  path = require('node:path')
const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
function color(c, mode) {
  if (!c) return ''
  if (c.style) return color(c.style, mode)
  if (typeof c === 'object' && c[mode]) return color(c[mode], mode)
  if (typeof c === 'object' && c.gradient)
    return `linear-gradient(135deg,${c.gradient.map((s) => s.color).join(',')})`
  return typeof c === 'string' ? c : ''
}
function css(p, mode, type, parentType) {
  let s = []
  const f = p.frame || {}
  if (f.width) s.push(`width:${f.width}px`)
  if (f.height) s.push(`height:${f.height}px;flex-shrink:0`)
  if (f.maxWidth === 'infinity') {
    s.push('min-width:0;width:100%')
    if (parentType === 'HStack') s.push('flex:1')
  }
  if (f.maxHeight === 'infinity')
    s.push(
      parentType === 'HStack'
        ? 'height:100%;min-height:0'
        : 'flex:1;min-height:0',
    )
  if (p.font) s.push(`font-size:${typeof p.font === 'number' ? p.font : 14}px`)
  if (p.fontWeight)
    s.push(
      `font-weight:${p.fontWeight === 'semibold' ? 600 : p.fontWeight === 'bold' ? 700 : 400}`,
    )
  if (p.monospacedDigit) s.push('font-variant-numeric:tabular-nums')
  if (p.foregroundStyle) s.push('color:' + color(p.foregroundStyle, mode))
  if (p.background || p.widgetBackground)
    s.push('background:' + color(p.background || p.widgetBackground, mode))
  if (p.background?.shape?.cornerRadius)
    s.push('border-radius:' + p.background.shape.cornerRadius + 'px')
  if (p.spacing !== undefined) s.push('gap:' + p.spacing + 'px')
  if (p.alignment === 'leading') s.push('align-items:flex-start')
  if (p.alignment === 'top') s.push('align-items:flex-start')
  if (p.alignment === 'firstTextBaseline') s.push('align-items:baseline')
  if (f.alignment === 'center') s.push('justify-content:center')
  if (['leading', 'topLeading', 'trailing'].includes(f.alignment)) {
    const horizontal = type === 'HStack'
    s.push(
      horizontal
        ? `justify-content:${f.alignment === 'trailing' ? 'flex-end' : 'flex-start'}`
        : `align-items:${f.alignment === 'trailing' ? 'flex-end' : 'flex-start'}`,
    )
    if (f.alignment === 'topLeading')
      s.push(
        horizontal ? 'align-items:flex-start' : 'justify-content:flex-start',
      )
  }
  if (p.padding) {
    const q = p.padding
    if (typeof q === 'number') s.push('padding:' + q + 'px')
    else
      s.push(
        `padding:${q.top ?? q.vertical ?? 0}px ${q.trailing ?? q.horizontal ?? 0}px ${q.bottom ?? q.vertical ?? 0}px ${q.leading ?? q.horizontal ?? 0}px`,
      )
  }
  if (p.lineLimit === 1)
    s.push('white-space:nowrap;overflow:hidden;text-overflow:ellipsis')
  return s.join(';')
}
const symbols = {
  'waveform.path': '⌁',
  'arrow.clockwise': '↻',
  'arrow.down': '↓',
  'arrow.up': '↑',
  'circle.fill': '●',
}
function render(n, mode, parentType) {
  if (n === null || n === undefined || n === false) return ''
  if (typeof n !== 'object') return esc(n)
  const p = n.props || {},
    children = (n.children || []).map((c) => render(c, mode, n.type)).join(''),
    style = css(p, mode, n.type, parentType)
  if (n.type === 'Fragment') return children
  if (n.type === 'Spacer') return '<span class="spacer"></span>'
  if (n.type === 'Text')
    return `<span class="text" style="${style}">${children}</span>`
  if (n.type === 'Image')
    return `<span class="symbol" style="${style}">${symbols[p.systemName] || '◈'}</span>`
  if (n.type === 'ProgressView')
    return `<div class="meter"><i style="width:${Math.min(100, ((p.value || 0) / (p.total || 1)) * 100)}%;background:${color(p.tint, mode)}"></i></div>`
  if (n.type === 'Chart') {
    const lines = n.children.flatMap((c) => c?.props?.marks || []),
      times = lines.map((m) => +m.label),
      from = Math.min(...times),
      to = Math.max(...times),
      max = p.chartYScale?.domain.to || 100
    return `<svg class="chart" style="${style}" viewBox="0 0 300 100" preserveAspectRatio="none">${n.children.map((c) => `<polyline points="${(c.props.marks || []).map((m) => `${((+m.label - from) / (to - from || 1)) * 300},${100 - (m.value / max) * 90}`).join(' ')}" stroke="${color(c.props.marks?.[0]?.foregroundStyle, mode)}" stroke-width="2" vector-effect="non-scaling-stroke" fill="none"/>`).join('')}</svg>`
  }
  if (n.type === 'Link' || n.type === 'NavigationLink')
    return `<a class="link" style="${style}" href="#" title="iOS 中打开对应原生页面">${children}</a>`
  if (n.type === 'Button')
    return `<button class="native-button" style="${style}">${p.title ? esc(p.title) : children}</button>`
  if (n.type === 'TextField')
    return `<input class="search" placeholder="${esc(p.prompt || p.title)}"/>`
  if (n.type === 'Picker')
    return `<div class="picker">${(n.children || []).map((c) => `<span class="${c.props.tag === p.value ? 'active' : ''}">${render(c, mode)}</span>`).join('')}</div>`
  if (n.type === 'Section')
    return `<section>${p.header ? `<div class="section-title">${render(p.header, mode)}</div>` : ''}<div class="section-body">${children}</div></section>`
  if (n.type === 'List')
    return `<div class="native-page" style="${style}"><nav>${esc(p.navigationTitle)} <span>↻ · 设置</span></nav>${children}</div>`
  return `<div class="${n.type === 'HStack' ? 'hstack' : 'vstack'}" style="${style}">${children}</div>`
}
async function main() {
  let widgetSections = []
  for (const mode of ['light', 'dark']) {
    let cards = []
    for (const [family, count] of process.env.KOMARI_PREVIEW_VARIANTS === '1'
      ? [
          ['systemMedium', 1],
          ['systemLarge', 1],
          ['systemLarge', 2],
          ['systemLarge', 3],
        ]
      : [
          ['systemSmall', 1],
          ['systemMedium', 2],
          ['systemLarge', 4],
        ]) {
      const h = harness({
        family,
        width:
          process.env.KOMARI_PREVIEW_LARGE_DEVICE === '1'
            ? family === 'systemSmall'
              ? 170
              : 364
            : family === 'systemSmall'
              ? 155
              : 329,
        height:
          process.env.KOMARI_PREVIEW_LARGE_DEVICE === '1'
            ? family === 'systemLarge'
              ? 382
              : 170
            : family === 'systemLarge'
              ? 345
              : 155,
      })
      h.load('widget.tsx')
      await h.globals.completion
      const m = h.load('model.ts'),
        snapshot = m.demoSnapshot()
      // Exercise a limited and unlimited pair without changing runtime demo data.
      snapshot.nodes[1].trafficLimit = null
      if (process.env.KOMARI_PREVIEW_WARNING === '1') {
        snapshot.transport = 'rpc'
        snapshot.cached = true
        snapshot.notice = '连接失败或响应无效 · 保留旧快照'
      }
      const view = h.load('widget.tsx').WidgetView({
        snapshot,
        family,
        ids: snapshot.nodes.slice(0, count).map((n) => n.id),
      })
      cards.push(
        `<article><div class="caption">${family === 'systemSmall' ? '01 / SMALL' : family === 'systemMedium' ? '02 / MEDIUM' : '03 / LARGE'}<span>${count} 台 VPS</span></div><div class="widget ${family}" style="width:${h.bridge.Widget.displaySize.width}px;height:${h.bridge.Widget.displaySize.height}px" data-theme="${mode}">${render(view, mode)}</div></article>`,
      )
    }
    widgetSections.push(
      `<div class="theme-group"><div class="mode-label">${mode === 'light' ? '晨光 / LIGHT' : '夜航 / DARK'}</div><div class="widget-grid">${cards.join('')}</div></div>`,
    )
  }
  const h = harness()
  if (process.env.KOMARI_PREVIEW_ERROR === '1') {
    const original = h.load('monitor.tsx').useMonitor
    h.load('monitor.tsx').useMonitor = () => {
      const m = original()
      return {
        ...m,
        snapshot: { ...m.snapshot, cached: true },
        error: '请求超时（8 秒），请检查网络或服务器',
        liveNote: '连接失败 · 自动重试',
      }
    }
  }
  h.load('index.tsx')
  await h.globals.completion
  const dashboard = h.load('index.tsx').Dashboard(),
    detail = h.load('detail.tsx').Detail({ id: 'demo-1' }),
    html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Komari 夜航 · 设计预览</title><style>
 *{box-sizing:border-box}body{margin:0;background:#e8eeeb;color:#172e32;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1120px;margin:auto;padding:44px 36px}.eyebrow{font-size:11px;font-weight:600;letter-spacing:3px;color:#087f78}h1{font-size:46px;letter-spacing:-2px;margin:14px 0 10px;font-weight:650}.subtitle{color:#607777;line-height:1.8;max-width:770px}.pill{display:inline-block;background:#d8e9e1;padding:6px 10px;font-size:11px;border-radius:20px;margin-top:10px}.theme-group{margin-top:34px}.mode-label{font-size:12px;letter-spacing:2px;margin-bottom:20px}.widget-grid{display:flex;gap:30px;align-items:flex-start}.caption{display:flex;justify-content:space-between;font-size:10px;letter-spacing:1px;color:#667e7b;margin:0 3px 10px}.caption span{letter-spacing:0}.widget{border-radius:25px;overflow:hidden;box-shadow:0 12px 32px #22393214;flex-shrink:0}.systemSmall{width:155px;height:155px}.systemMedium{width:329px;height:155px}.systemLarge{width:329px;height:345px}.vstack{display:flex;flex-direction:column;align-items:center;min-width:0}.hstack{display:flex;flex-direction:row;align-items:center;min-width:0;width:100%}.text{display:block;line-height:1.18;min-width:0;flex-shrink:0}.hstack>.text{flex-shrink:1}.spacer{flex:1;min-width:0}.symbol{display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1}.link{display:flex;flex-direction:column;color:inherit;text-decoration:none;min-width:0}.meter{height:3px;background:#96a6a526;border-radius:4px;width:100%;overflow:hidden;flex-shrink:0}.meter i{display:block;height:100%;border-radius:4px}.chart{width:100%;overflow:visible;flex-shrink:0}.native-button{border:0;padding:0;background:none;color:#087f78;font:inherit;flex-shrink:0;cursor:pointer}.widget[data-theme="dark"]{color:#e7f4f0}.widget .link{min-height:0}.phones{display:flex;flex-wrap:wrap;gap:30px;margin-top:26px}.phone{width:375px;height:690px;overflow:auto;border-radius:30px;background:#f1f6f4;border:7px solid #223336;box-shadow:0 12px 32px #22393215;scrollbar-width:none}.native-page{padding:16px 12px}.native-page nav{font-size:17px;font-weight:600;display:flex;justify-content:space-between;margin:4px 4px 18px}.native-page nav span{font-size:12px;color:#087f78}.native-page section{margin-bottom:15px}.section-title{padding:7px 5px;font-size:11px;color:#6f8380}.section-body{background:white;border-radius:17px;padding:14px;display:flex;flex-direction:column;gap:12px}.native-page .section-body>.link{width:100%}.native-page .hstack{gap:14px}.search{background:#f3f6f5;border:0;width:100%;padding:12px;border-radius:10px;font:inherit}.picker{display:flex;background:#eef3f1;padding:3px;border-radius:9px;gap:3px}.picker>span{flex:1;text-align:center;padding:8px 2px;font-size:12px;border-radius:7px}.picker .active{background:white;box-shadow:0 1px 4px #0001}.phone.dark{background:#0c161b;color:#e7f4f0}.phone.dark .section-body{background:#17252b}.phone.dark .section-title{color:#94aba9}.phone.dark .picker{background:#203B3A}.phone.dark .picker .active{background:#2b3f44}.phone.dark .search{background:#203B3A;color:#e7f4f0}.footnote{font-size:12px;line-height:1.8;color:#687d79;margin-top:25px}@media(max-width:950px){.widget-grid{flex-wrap:wrap}.phones{flex-wrap:wrap}main{padding:30px 20px}}
 </style><main><div class="eyebrow">KOMARI × SCRIPTING</div><h1>云端，一眼可见。</h1><p class="subtitle">Komari 夜航 · 三种尺寸各有节奏。晨光里是柔和的纸面，夜晚变成安静的控制台。资源水位、流量额度、延迟与丢包率，放在视线之内。全屏面板持续更新，站点名称与图标自动适配。</p><div class="pill">从实际 TSX 生成 · 演示数据 · HTML 布局近似，非 iOS 截图</div>${widgetSections.join('')}<div class="mode-label" style="margin-top:45px">FLEET & NODE / 原生总览与详情</div><div class="phones"><div class="phone">${render(dashboard, 'light')}</div><div class="phone">${render(detail, 'light')}</div><div class="phone dark">${render(dashboard, 'dark')}</div><div class="phone dark">${render(detail, 'dark')}</div></div><p class="footnote">此预览用于审阅内容与配色。字体、SF Symbols、SwiftUI 自适应尺寸和系统边距以 iPhone 实际渲染为准。页面中的演示按钮不连接服务器。</p></main></html>`
  fs.mkdirSync(path.join(__dirname, '..', 'assets'), { recursive: true })
  fs.writeFileSync(
    path.join(__dirname, '..', 'assets', 'design-preview.html'),
    html,
  )
  console.log('Generated design-preview.html from TSX view trees.')
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
