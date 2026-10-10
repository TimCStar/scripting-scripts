import { fetch, UIImage } from 'scripting'
import { normalizeLogo, type Config, type Subscription } from './model'
import { type Credential } from './client'
import { demoIcon } from './demo-icons'
import { openaiIcon } from './brand-icons'

type Logo = { svg: string } | { image: UIImage }
const PREFIX = 'renewlet.logo.v1.',
  INDEX = PREFIX + 'index'
const memory = new Map<string, Logo>(),
  pending = new Map<string, Promise<void>>()
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
    /^(?:fill|stroke|opacity|fill-opacity|stroke-opacity|stroke-width|fill-rule|clip-rule|stroke-linecap|stroke-linejoin|stroke-miterlimit)$/
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
async function load(c: Config, s: Subscription, auth: Credential | null) {
  if (!s.logo || c.mode === 'demo') return
  const k = key(c, s.logo),
    meta = Storage.get<{ time: number }>(k)
  if (restore(c, s.logo) && meta && Date.now() - meta.time < TTL) return
  if (pending.has(k)) return pending.get(k)
  const request = logoRequest(c, s.logo, auth)
  if (!request) return
  const start = generation
  const job = (async () => {
    try {
      let redirects = 0
      const response = await fetch(request.url, {
        method: 'GET',
        headers: request.headers,
        timeout: 5,
        allowInsecureRequest: request.url.startsWith('http:'),
        handleRedirect: async (redirect) => {
          if (
            Object.keys(request.headers).length ||
            ++redirects > 4 ||
            !normalizeLogo(redirect.url) ||
            (request.url.startsWith('https:') &&
              !redirect.url.startsWith('https:'))
          )
            return null
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
      if (!response.ok || (response.expectedContentLength ?? 0) > MAX_BYTES)
        return
      const data = await response.data()
      if (!data || data.size > MAX_BYTES) return
      const mime = (response.mimeType || '').toLowerCase()
      let value: Logo | null = null
      const prefix =
        data.slice(0, Math.min(4096, data.size)).toRawString() || ''
      if (mime.includes('svg') || /<svg[\s>]|<\?xml/i.test(prefix)) {
        const svg = safeSVG(data.toRawString() || '')
        if (svg) value = { svg }
      } else {
        const decoded = UIImage.fromData(data)
        const image =
          decoded?.preparingThumbnail({
            width: 120,
            height: 120,
          }) || decoded
        if (image) value = { image }
      }
      if (value && generation === start) {
        memory.set(k, value)
        remember(k, value)
      }
    } catch {
      /* A failed logo never hides the subscription or stops refresh. */
    }
  })()
  pending.set(k, job)
  try {
    await job
  } finally {
    pending.delete(k)
  }
}
export async function prepareLogos(
  c: Config,
  list: Subscription[],
  auth: Credential | null,
) {
  const queue = [...list],
    start = generation
  // Four concurrent requests; widgets only pass the rows they actually display.
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length && generation === start)
        await load(c, queue.shift()!, auth)
    }),
  )
}
