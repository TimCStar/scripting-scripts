import { fetch, UIImage } from 'scripting'
import { normalizeLogo, type Config, type Subscription } from './model'
import { type Credential } from './client'
import { demoIcon } from './demo-icons'

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
  if (
    input.length > 262144 ||
    !/<svg[\s>]/i.test(input) ||
    /<!DOCTYPE|<!ENTITY|<\?(?!xml\s)|<(?:[\w.-]+:)?(?:script|foreignObject|image|iframe|object|embed|style|a|animate\w*|set)\b|\bon\w+\s*=|@import|\/\*|\\/i.test(
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
  return input.replace(/<\?xml[^?]*\?>/gi, '').trim()
}
export function logoRequest(c: Config, raw: string, auth: Credential | null) {
  const logo = normalizeLogo(raw)
  if (!logo) return null
  if (logo.startsWith('/')) {
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
      url: c.baseURL + logo,
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
  return s.logo ? restore(c, s.logo) : null
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
      const response = await fetch(request.url, {
        method: 'GET',
        headers: request.headers,
        timeout: 5,
        allowInsecureRequest: request.url.startsWith('http:'),
        handleRedirect: async () => null,
      })
      if (!response.ok || (response.expectedContentLength ?? 0) > MAX_BYTES)
        return
      const data = await response.data()
      if (!data || data.size > MAX_BYTES) return
      const mime = (response.mimeType || '').toLowerCase()
      let value: Logo | null = null
      const prefix = data.slice(0, Math.min(256, data.size)).toRawString() || ''
      if (mime.includes('svg') || /<svg[\s>]|<\?xml/i.test(prefix)) {
        const svg = safeSVG(data.toRawString() || '')
        if (svg) value = { svg }
      } else {
        const image = UIImage.fromData(data)?.preparingThumbnail({
          width: 120,
          height: 120,
        })
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
