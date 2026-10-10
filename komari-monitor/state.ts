import { fetch } from 'scripting'
import {
  defaultConfig,
  parseConfig,
  demoSnapshot,
  iso,
  type Config,
  type Snapshot,
  type Node,
  type Family,
  selectedIDs,
  object,
  validID,
  capacity,
  type ProbeHistory,
} from './model'
import { KomariClient, errorMessage, type Fetcher } from './client'
export const CONFIG_KEY = 'komari.config.v1',
  CACHE_KEY = 'komari.snapshot.v1'
const AUTH_PREFIX = 'komari.auth.'
export function readConfig(): Config {
  try {
    return parseConfig(Storage.get(CONFIG_KEY))
  } catch {
    return { ...defaultConfig(), demo: false, revision: 'invalid' }
  }
}
function authKey(c: Config): string {
  return AUTH_PREFIX + encodeURIComponent(c.baseURL)
}
export function readToken(c: Config): string {
  if (c.demo) return ''
  const raw = Keychain.get(authKey(c))
  if (!raw) return ''
  const r = object(JSON.parse(raw))
  if (r.baseURL !== c.baseURL || typeof r.token !== 'string')
    throw new Error('凭证配置无效')
  return r.token
}
export function saveConfig(c: Config, token: string): void {
  // Blank retains only the token bound to this exact server. Switching server cannot reuse another key.
  if (
    token.trim() &&
    !Keychain.set(
      authKey(c),
      JSON.stringify({ baseURL: c.baseURL, token: token.trim() }),
      { accessibility: 'first_unlock_this_device', synchronizable: false },
    )
  )
    throw new Error('凭证保存失败')
  if (!Storage.set(CONFIG_KEY, c)) throw new Error('设置保存失败')
  Storage.set(CACHE_KEY, null)
}
export function removeToken(c: Config): void {
  const key = authKey(c)
  if (Keychain.get(key) !== null && !Keychain.remove(key))
    throw new Error('凭证删除失败')
  if (!Storage.set(CACHE_KEY, null)) throw new Error('缓存清理失败')
}
export function readCache(c: Config): Snapshot | null {
  try {
    const r = object(Storage.get(CACHE_KEY))
    const s = object(r.snapshot)
    if (
      r.revision !== c.revision ||
      r.baseURL !== c.baseURL ||
      !iso(s.fetchedAt) ||
      !Array.isArray(s.nodes) ||
      !['rpc', 'rest'].includes(String(s.transport))
    )
      return null
    // Cache is generated locally from the wire allowlist; never accept a legacy schema.
    if (
      r.schema !== 2 ||
      s.nodes.some(
        (n) =>
          !n ||
          typeof n !== 'object' ||
          typeof n.id !== 'string' ||
          !Array.isArray(n.history),
      )
    )
      return null
    return { ...(s as unknown as Snapshot), cached: true }
  } catch {
    return null
  }
}
export function initialSnapshot(c: Config): Snapshot {
  return c.demo
    ? demoSnapshot()
    : readCache(c) || {
        nodes: [],
        fetchedAt: '',
        transport: 'rpc',
        notice: c.baseURL ? '正在连接…' : '请在设置中填写 Komari 站点地址',
      }
}
const running = new Map<string, Promise<Snapshot>>()
export async function refresh(
  c: Config,
  family?: Family,
  parameter = '',
  quick = false,
): Promise<Snapshot> {
  if (c.demo) return demoSnapshot()
  const key =
    c.revision + '|' + (family || 'all') + '|' + parameter + '|' + quick
  if (running.has(key)) return running.get(key)!
  const job = (async () => {
    const cache = readCache(c)
    try {
      const token = readToken(c)
      const client = new KomariClient(c.baseURL, token, fetch as Fetcher)
      // With an empty initial cache, selection is resolved after fetching the node list.
      let priorIDs = family
        ? parameter.trim()
          ? parameter.trim().split(/[,，\s]+/)
          : c.selections[family]
        : undefined
      if (priorIDs?.some((id) => !validID(id)))
        throw new Error('组件参数只接受逗号分隔的 VPS UUID')
      if (family && priorIDs)
        priorIDs = [...new Set(priorIDs)].slice(0, capacity(family))
      let fresh =
        quick && cache
          ? await client.update(cache)
          : await client.snapshot(priorIDs?.length ? priorIDs : undefined)
      if (!quick) {
        const oldSite = cache?.site
        fresh.site = { ...oldSite, ...fresh.site }
        if (
          !oldSite?.iconCheckedAt ||
          Date.now() - Date.parse(oldSite.iconCheckedAt) > 6 * 3600_000
        ) {
          fresh.site = {
            ...fresh.site,
            title: fresh.site?.title || '',
            iconCheckedAt: new Date().toISOString(),
          }
          try {
            // Komari serves its uploaded/theme icon at this public, same-site route.
            const response = await fetch(c.baseURL + '/favicon.ico', {
              method: 'GET',
              timeout: 4,
              handleRedirect: async () => null,
            })
            if (
              response.ok &&
              (response.expectedContentLength ?? 0) <= 131072
            ) {
              const data = await response.data()
              if (data.size <= 131072) {
                const icon = UIImage.fromData(data)?.preparingThumbnail({
                  width: 64,
                  height: 64,
                })
                fresh.site.icon = icon?.toPNGBase64String() || undefined
              }
            } else fresh.site.icon = undefined
          } catch {
            /* Keep the previous decoded icon during transient errors. */
          }
        }
      }
      if (family) {
        const ids = selectedIDs(c, fresh.nodes, family, parameter)
        const chosen = fresh.nodes.filter((n) => ids.includes(n.id))
        if (client.mode === 'rpc' && !priorIDs?.length)
          await Promise.all(
            chosen.map(async (n) => {
              try {
                n.history = await client.recent(n.id)
              } catch {}
            }),
          )
      }
      if (readConfig().revision !== c.revision || readToken(c) !== token)
        return {
          nodes: [],
          fetchedAt: '',
          transport: client.mode,
          notice: '配置已改变，请重新刷新',
        }
      // A subset widget read does not erase the other nodes' last known readings.
      if (family && cache)
        fresh.nodes = fresh.nodes.map((n) => {
          if (n.status || n.error) return n
          const old = cache.nodes.find((o) => o.id === n.id)
          return old ? { ...n, status: old.status, history: old.history } : n
        })
      const saved = Storage.set(CACHE_KEY, {
        schema: 2,
        baseURL: c.baseURL,
        revision: c.revision,
        snapshot: fresh,
      })
      if (!saved)
        fresh.notice = [fresh.notice, '本机缓存保存失败']
          .filter(Boolean)
          .join(' · ')
      return fresh
    } catch (e) {
      if (readConfig().revision !== c.revision)
        return {
          nodes: [],
          fetchedAt: '',
          transport: 'rpc',
          notice: '配置已改变，请重新刷新',
        }
      return cache
        ? { ...cache, cached: true, notice: errorMessage(e) + ' · 保留旧快照' }
        : {
            nodes: [],
            fetchedAt: '',
            transport: 'rpc',
            notice: errorMessage(e),
          }
    }
  })()
  running.set(key, job)
  try {
    return await job
  } finally {
    running.delete(key)
  }
}
export async function loadHistory(
  c: Config,
  n: Node,
  hours: number,
  mode: 'rpc' | 'rest' | 'demo',
) {
  if (readConfig().revision !== c.revision) return []
  if (c.demo) return n.history
  const token = readToken(c),
    client = new KomariClient(c.baseURL, token, fetch as Fetcher)
  client.mode = mode === 'rest' ? 'rest' : 'rpc'
  const result = await client.history(n.id, hours)
  return readConfig().revision === c.revision && readToken(c) === token
    ? result
    : []
}
export async function loadProbes(
  c: Config,
  n: Node,
  hours: number,
  mode: Snapshot['transport'],
): Promise<ProbeHistory[]> {
  if (readConfig().revision !== c.revision) return []
  if (c.demo)
    return (n.status?.ping || []).map((p) => ({
      ...p,
      points: n.history.map((s, i) => ({
        time: s.time,
        value:
          i === 9 ? null : Math.max(0, (p.avg || 0) + Math.sin(i * 0.8) * 4),
      })),
    }))
  const token = readToken(c),
    client = new KomariClient(c.baseURL, token, fetch as Fetcher)
  client.mode = mode === 'rest' ? 'rest' : 'rpc'
  const result = await client.probes(n.id, hours)
  return readConfig().revision === c.revision && readToken(c) === token
    ? result
    : []
}
