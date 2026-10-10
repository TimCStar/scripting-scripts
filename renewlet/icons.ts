import { fetch, UIImage } from 'scripting'
import { normalizeLogo, type Config, type Subscription } from './model'
import { type Credential } from './client'
import { demoIcon } from './demo-icons'
import { openaiIcon } from './brand-icons'

type Logo = { svg: string } | { image: UIImage }
type LoadResult = { ok: boolean; message: string }
export type LogoCheck = LoadResult & {
  id: string
  name: string
  source: string
  retained: boolean
}
const PREFIX = 'renewlet.logo.v1.',
  INDEX = PREFIX + 'index'
const memory = new Map<string, Logo>(),
  pending = new Map<string, Promise<LoadResult>>()
const MAX_BYTES = 2 * 1024 * 1024,
  TTL = 7 * 86400000
let generation = 0
function key(c: Config, logo: string) {
  return (
    PREFIX +
    encodeURIComponent(JSON.stringify([c.baseURL, c.mode, c.revision, logo]))
  )
}
// Only static, self-contained vector artwork reaches the SVG renderer.
export function safeSVG(input: string): string | null {
  // Exported artwork often contains comments, a standard SVG DTD or simple CSS.
  // Strip the DTD without resolving it; internal subsets/entities remain forbidden.
  input = input
    .replace(/<!--[^]*?-->/g, '')
    .replace(
      /<!DOCTYPE\s+svg\s+(?:PUBLIC\s+"[^"]*"\s+"[^"]*"|SYSTEM\s+"[^"]*")\s*>/gi,
      '',
    )
  if (
    input.length > 262144 ||
    !/<svg[\s>]/i.test(input) ||
    /<!DOCTYPE|<!ENTITY|<\?(?!xml\s)|<(?:[\w.-]+:)?(?:script|foreignObject|image|iframe|object|embed|a|animate\w*|set)\b|\bon\w+\s*=|@import|\\/i.test(
      input,
    )
  )
    return null
  for (const m of input.matchAll(
    /(?:[\w-]+:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  ))
    if (!/^#[A-Za-z0-9_.:-]+$/.test(m[1] ?? m[2] ?? m[3])) return null
  for (const m of input.matchAll(/url\s*\(([\s\S]*?)\)/gi))
    if (!/^['"]?#[A-Za-z0-9_.:-]+['"]?$/.test(m[1].trim())) return null
  // Entity-encoded URLs/attribute names cannot bypass reference checks.
  if (/&#|&(?!amp;|lt;|gt;|quot;|apos;)[A-Za-z]/i.test(input)) return null
  const allowed =
    /^(?:fill|stroke|opacity|fill-opacity|stroke-opacity|stroke-width|fill-rule|clip-rule|stroke-linecap|stroke-linejoin|stroke-miterlimit|stop-color|stop-opacity|stroke-dasharray|stroke-dashoffset|clip-path|mask|filter|color|color-interpolation|color-interpolation-filters|flood-color|flood-opacity)$/
  function declarations(css: string): string | null {
    let attrs = ''
    for (const part of css.split(';').filter((x) => x.trim())) {
      const match = part.trim().match(/^([\w-]+)\s*:\s*([^]*?)$/)
      if (!match || !allowed.test(match[1]) || /[<>"'{}&]/.test(match[2]))
        return null
      attrs += ` ${match[1]}="${match[2].trim()}"`
    }
    return attrs
  }
  let invalid = false
  const rules: { selector: string; attrs: string }[] = []
  input = input.replace(
    /<style\b[^>]*>([^]*?)<\/style>/gi,
    (_, css: string) => {
      css = css.replace(/\/\*[^]*?\*\//g, '').replace(/<!\[CDATA\[|\]\]>/g, '')
      const rest = css.replace(
        /([^{}]+)\{([^{}]*)\}/g,
        (_, selectors: string, body: string) => {
          const attrs = declarations(body)
          for (const selector of selectors.split(',').map((x) => x.trim())) {
            if (!/^[.#][A-Za-z_][\w-]*$/.test(selector) || attrs === null)
              invalid = true
            else rules.push({ selector, attrs })
          }
          return ''
        },
      )
      if (rest.trim()) invalid = true
      return ''
    },
  )
  input = input.replace(
    /<([A-Za-z][\w:-]*)([^<>]*?)(\/?)>/g,
    (_, tag: string, attrs: string, slash: string) => {
      let applied = ''
      const classes =
        attrs.match(/\bclass\s*=\s*["']([^"']*)["']/)?.[1].split(/\s+/) || []
      const id = attrs.match(/\bid\s*=\s*["']([^"']*)["']/)?.[1]
      for (const rule of rules)
        if (
          rule.selector[0] === '.'
            ? classes.includes(rule.selector.slice(1))
            : id === rule.selector.slice(1)
        )
          applied += rule.attrs
      attrs = attrs.replace(
        /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
        (_, a, b) => {
          const result = declarations(a ?? b)
          if (result === null) invalid = true
          else applied += result
          return ''
        },
      )
      // CSS overrides presentation attributes; avoid duplicate XML attributes.
      for (const m of applied.matchAll(/ ([\w-]+)="/g))
        attrs = attrs.replace(
          new RegExp('\\s' + m[1] + '\\s*=\\s*(?:"[^"]*"|\'[^\']*\')', 'g'),
          '',
        )
      const properties = new Map<string, string>()
      for (const m of applied.matchAll(/ ([\w-]+)="([^"]*)"/g))
        properties.set(m[1], m[2])
      return `<${tag}${attrs}${[...properties].map(([k, v]) => ` ${k}="${v}"`).join('')}${slash}>`
    },
  )
  if (invalid) return null
  return input
    .replace(/<\?xml[^?]*\?>/gi, '')
    .replaceAll('currentColor', '#20243B')
    .trim()
}
export function logoRequest(
  c: Config,
  raw: string,
  auth: Credential | null,
): { url: string; headers: Record<string, string> } | null {
  const logo = normalizeLogo(raw)
  if (!logo) return null
  const url = logo.startsWith('/') ? c.baseURL + logo : logo
  const base = new URL(c.baseURL),
    target = new URL(url)
  const assetPrefix = base.pathname.replace(/\/$/, '') + '/api/app/assets/'
  const privateAsset =
    target.origin === base.origin &&
    target.pathname.startsWith(assetPrefix) &&
    /^[A-Za-z0-9_-]+$/.test(target.pathname.slice(assetPrefix.length))
  if (privateAsset) {
    if (
      c.mode !== 'session' ||
      auth?.mode !== 'session' ||
      !auth.session ||
      /[;\s]/.test(auth.session) ||
      !auth.expiresAt ||
      !Number.isFinite(Date.parse(auth.expiresAt)) ||
      Date.parse(auth.expiresAt) <= Date.now()
    )
      return null
    return {
      url,
      headers: { Cookie: `renewlet_session=${auth.session}` },
    }
  }
  // External image services never receive account credentials.
  return { url: logo, headers: {} }
}
function restore(c: Config, logo: string): Logo | null {
  const k = key(c, logo)
  if (memory.has(k)) return memory.get(k)!
  try {
    const meta = Storage.get<{ time: number; svg?: string }>(k)
    if (!meta) return null
    const svg = meta.svg && safeSVG(meta.svg)
    const data = !svg ? Storage.getData(k + '.data') : null
    const image = data ? UIImage.fromData(data) : null
    const value = svg ? { svg } : image ? { image } : null
    if (value) memory.set(k, value)
    return value
  } catch {
    return null
  }
}
export function readLogo(c: Config, s: Subscription): Logo | null {
  if (c.mode === 'demo') {
    const svg = demoIcon(s.id)
    return svg ? { svg } : null
  }
  return (
    (s.logo ? restore(c, s.logo) : null) ||
    (/chat\s*gpt|openai/i.test(s.name) ? { svg: openaiIcon } : null)
  )
}
export function logoBackground(logo: Logo): string {
  return 'svg' in logo &&
    /(?:fill|stroke)\s*=\s*["'](?:white|#fff(?:fff)?|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))["']/i.test(
      logo.svg,
    )
    ? '#293147'
    : '#FFFFFF'
}
export function clearLogos() {
  generation++
  memory.clear()
  for (const k of Storage.keys()) if (k.startsWith(PREFIX)) Storage.remove(k)
}
function remember(k: string, logo: Logo) {
  const entries = Storage.get<string[]>(INDEX) || []
  const next = [...entries.filter((x) => x !== k), k]
  while (next.length > 80) {
    const old = next.shift()!
    Storage.remove(old)
    Storage.remove(old + '.data')
    memory.delete(old)
  }
  if ('svg' in logo) Storage.set(k, { time: Date.now(), svg: logo.svg })
  else {
    const data = logo.image.toPNGData()
    if (!data) return
    Storage.setData(k + '.data', data)
    Storage.set(k, { time: Date.now() })
  }
  Storage.set(INDEX, next)
}
async function load(
  c: Config,
  s: Subscription,
  auth: Credential | null,
  force: boolean,
): Promise<LoadResult> {
  const start = generation
  if (c.mode === 'demo') return { ok: true, message: '包内演示图标' }
  if (!s.logo) return { ok: false, message: '未配置图标' }
  const k = key(c, s.logo),
    meta = Storage.get<{ time: number }>(k)
  if (!force && restore(c, s.logo) && meta && Date.now() - meta.time < TTL)
    return { ok: true, message: '已有本机缓存' }
  if (pending.has(k)) {
    if (!force) return pending.get(k)!
    await pending.get(k)
    if (generation !== start)
      return { ok: false, message: '连接已改变，结果已丢弃' }
  }
  const request = logoRequest(c, s.logo, auth)
  if (!request)
    return {
      ok: false,
      message: normalizeLogo(s.logo)
        ? '私有图标需要有效登录会话'
        : '图标地址不支持',
    }
  const job = (async (): Promise<LoadResult> => {
    let redirectBlocked = false
    let received = false
    try {
      let redirects = 0
      const response = await fetch(request.url, {
        method: 'GET',
        headers: request.headers,
        timeout: force ? 15 : 5,
        allowInsecureRequest: request.url.startsWith('http:'),
        handleRedirect: async (redirect) => {
          if (
            Object.keys(request.headers).length ||
            ++redirects > 4 ||
            !normalizeLogo(redirect.url) ||
            (request.url.startsWith('https:') &&
              !redirect.url.startsWith('https:'))
          ) {
            redirectBlocked = true
            return null
          }
          // Redirected external logos stay anonymous, including any supplied cookies.
          return {
            ...redirect,
            method: 'GET',
            headers: {},
            cookies: [],
            body: undefined,
          }
        },
      })
      received = true
      if (redirectBlocked && !response.ok)
        return {
          ok: false,
          message: '重定向被拒绝（跨站私有图标、降级或跳转过多）',
        }
      if (!response.ok)
        return {
          ok: false,
          message: `HTTP ${response.status}${[401, 403].includes(response.status) ? ' · 无权读取或被图床拒绝' : ''}`,
        }
      if ((response.expectedContentLength ?? 0) > MAX_BYTES)
        return { ok: false, message: '图片超过 2 MiB' }
      const data = await response.data()
      if (!data || !data.size) return { ok: false, message: '响应为空' }
      if (data.size > MAX_BYTES) return { ok: false, message: '图片超过 2 MiB' }
      const mime = (response.mimeType || '').toLowerCase()
      let value: Logo | null = null
      const prefix =
        data.slice(0, Math.min(4096, data.size)).toRawString() || ''
      if (mime.includes('svg') || /<svg[\s>]|<\?xml/i.test(prefix)) {
        const svg = safeSVG(data.toRawString() || '')
        if (svg) value = { svg }
        else return { ok: false, message: 'SVG 含暂不支持的样式或外部内容' }
      } else {
        if (
          mime.includes('html') ||
          /<!doctype\s+html|<html[\s>]/i.test(prefix)
        )
          return { ok: false, message: '返回了网页，可能是登录页或图床验证页' }
        const decoded = UIImage.fromData(data)
        const image =
          decoded?.preparingThumbnail({
            width: 120,
            height: 120,
          }) || decoded
        if (image) value = { image }
        else
          return { ok: false, message: '设备无法解码此图片，可改为 PNG / JPEG' }
      }
      if (value && generation === start) {
        memory.set(k, value)
        remember(k, value)
      }
      return generation === start
        ? {
            ok: true,
            message: 'svg' in value! ? 'SVG 已下载并通过检查' : '图片已解码',
          }
        : { ok: false, message: '连接已改变，结果已丢弃' }
    } catch {
      return {
        ok: false,
        message: redirectBlocked
          ? '重定向被拒绝（跨站私有图标、降级或跳转过多）'
          : received
            ? '读取、解码或缓存失败'
            : '请求未完成（网络、TLS 或超时）',
      }
    }
  })()
  pending.set(k, job)
  try {
    return await job
  } finally {
    if (pending.get(k) === job) pending.delete(k)
  }
}
export async function prepareLogos(
  c: Config,
  list: Subscription[],
  auth: Credential | null,
  force = false,
): Promise<LogoCheck[]> {
  const queue = list.map((s, index) => ({ s, index })),
    results: LogoCheck[] = [],
    jobs = new Map<string, Promise<LoadResult>>(),
    start = generation
  // Four concurrent requests; widgets only pass the rows they actually display.
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length && generation === start) {
        const { s, index } = queue.shift()!
        const identity = s.logo || s.id
        if (!jobs.has(identity)) jobs.set(identity, load(c, s, auth, force))
        const result = await jobs.get(identity)!
        let source = '无图标地址'
        if (s.logo) {
          try {
            source = new URL(
              s.logo.startsWith('/') ? c.baseURL + s.logo : s.logo,
            ).hostname
          } catch {
            source = '无效地址'
          }
        }
        results[index] = {
          ...result,
          id: s.id,
          name: s.name,
          source,
          retained: !result.ok && !!readLogo(c, s),
        }
      }
    }),
  )
  return results.filter(Boolean)
}
