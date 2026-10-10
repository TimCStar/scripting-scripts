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
  if (typeof c === 'object' && c[mode]) return color(c[mode], mode)
  if (typeof c === 'object' && c.gradient)
    return `linear-gradient(135deg,${c.gradient.map((s) => s.color).join(',')})`
  return typeof c === 'string' ? c : ''
}
function css(p, mode, parent) {
  let s = []
  const f = p.frame || {}
  if (f.width) s.push(`width:${f.width}px`)
  if (f.height) s.push(`height:${f.height}px`)
  if (f.minHeight) s.push(`min-height:${f.minHeight}px`)
  if (typeof f.maxHeight === 'number') s.push(`max-height:${f.maxHeight}px`)
  if (f.minWidth) s.push(`min-width:${f.minWidth}px`)
  if (typeof f.maxWidth === 'number') s.push(`max-width:${f.maxWidth}px`)
  if (f.maxWidth === 'infinity')
    s.push(
      parent === 'HStack' ? 'flex:1;min-width:0' : 'min-width:0;width:100%',
    )
  if (f.maxHeight === 'infinity') s.push('flex-grow:1;min-height:0')
  if (f.height) s.push('justify-content:center')
  if (p.font) s.push(`font-size:${typeof p.font === 'number' ? p.font : 14}px`)
  if (p.fontWeight)
    s.push(
      `font-weight:${p.fontWeight === 'semibold' ? 600 : p.fontWeight === 'bold' ? 700 : 400}`,
    )
  if (p.monospacedDigit) s.push('font-variant-numeric:tabular-nums')
  if (p.foregroundStyle) s.push('color:' + color(p.foregroundStyle, mode))
  if (p.background || p.widgetBackground)
    s.push('background:' + color(p.background || p.widgetBackground, mode))
  if (p.spacing !== undefined) s.push('gap:' + p.spacing + 'px')
  if (p.alignment === 'leading') s.push('align-items:flex-start')
  if (p.alignment === 'trailing') s.push('align-items:flex-end')
  if (p.alignment === 'top') s.push('align-items:flex-start')
  if (p.alignment === 'firstTextBaseline') s.push('align-items:baseline')
  if (f.alignment === 'center') s.push('justify-content:center')
  if (f.alignment === 'leading' || f.alignment === 'topLeading')
    s.push('align-items:flex-start;text-align:left')
  if (f.alignment === 'topLeading') s.push('justify-content:flex-start')
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
  if (p.clipShape?.cornerRadius)
    s.push('border-radius:' + p.clipShape.cornerRadius + 'px')
  if (f.width && f.height)
    s.push(
      'display:flex;align-items:center;justify-content:center;flex-shrink:0',
    )
  return s.join(';')
}
const symbols = {
  'calendar.badge.clock': '◷',
  calendar: '▦',
  'waveform.path': '⌁',
  'arrow.clockwise': '↻',
  'arrow.down': '↓',
  'arrow.up': '↑',
  'circle.fill': '●',
}
function render(n, mode, parent) {
  if (n === null || n === undefined || n === false) return ''
  if (typeof n !== 'object') return esc(n)
  const p = n.props || {},
    children = (n.children || []).map((c) => render(c, mode, n.type)).join(''),
    style = css(p, mode, parent)
  if (n.type === 'Fragment') return children
  if (n.type === 'Spacer') return '<span class="spacer"></span>'
  if (n.type === 'Text')
    return `<span class="text" style="${style}">${children}</span>`
  if (n.type === 'Image')
    if (p.image)
      return `<img src="${esc(p.image.source)}" style="${style};object-fit:contain"/>`
    else
      return `<span class="symbol" style="${style}">${symbols[p.systemName] || '◈'}</span>`
  if (n.type === 'SVG')
    return `<div style="${style}">${p.code.replace('<svg ', '<svg width="100%" height="100%" ')}</div>`
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

module.exports = { render }
