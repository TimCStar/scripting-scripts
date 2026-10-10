import {
  object,
  normalizeURL,
  normalizeNodes,
  normalizeStatus,
  normalizeHistory,
  normalizePingRecords,
  normalizeProbeHistory,
  sample,
  text,
  type Config,
  type Snapshot,
  type Sample,
} from './model'
export type Fetcher = (
  url: string,
  init: {
    method: string
    headers: Record<string, string>
    body?: string
    timeout: number
    handleRedirect: () => Promise<null>
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
class APIError extends Error {
  code: number
  constructor(message: string, code = 0) {
    super(message)
    this.code = code
  }
}
export function errorMessage(e: unknown): string {
  return e instanceof APIError
    ? e.message
    : e instanceof Error &&
        /^(节点|历史|请输入|地址|请填写|所选|组件)/.test(e.message)
      ? e.message
      : '连接失败或响应无效，请检查网络、地址和凭证'
}
export class KomariClient {
  base: string
  token: string
  fetcher: Fetcher
  mode: 'rpc' | 'rest' = 'rpc'
  counter = 0
  constructor(base: string, token: string, fetcher: Fetcher) {
    this.base = normalizeURL(base)
    this.token = token
    this.fetcher = fetcher
  }
  async request(path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    if (body) headers['Content-Type'] = 'application/json'
    const response = await this.fetcher(this.base + path, {
      method: body ? 'POST' : 'GET',
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      timeout: 8,
      handleRedirect: async () => null,
    })
    if (!response.ok)
      throw new APIError(
        response.status === 401 || response.status === 403
          ? '无权读取：私有站点请填写有效 API Key'
          : `读取失败（HTTP ${response.status}）`,
        response.status,
      )
    return response.json()
  }
  async rpc(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    const id = ++this.counter,
      r = object(
        await this.request('/api/rpc2', { jsonrpc: '2.0', id, method, params }),
      )
    if (r.id !== id || r.jsonrpc !== '2.0')
      throw new APIError('RPC 响应格式无效')
    if (r.error) {
      const code = object(r.error).code
      throw new APIError(
        code === -32041
          ? '无权读取：请检查 API Key'
          : `RPC 读取失败（${String(code)}）`,
        typeof code === 'number' ? code : 0,
      )
    }
    if (!('result' in r)) throw new APIError('RPC 响应缺少结果')
    return r.result
  }
  async rest(path: string): Promise<unknown> {
    const r = object(await this.request(path))
    if (r.status !== 'success') throw new APIError('REST 响应格式无效')
    return r.data
  }
  async snapshot(ids?: string[]): Promise<Snapshot> {
    let nodes: Snapshot['nodes']
    try {
      nodes = normalizeNodes(await this.rpc('common:getNodes'))
    } catch (e) {
      if (!(e instanceof APIError) || ![404, 405, -32601].includes(e.code))
        throw e
      this.mode = 'rest'
      nodes = normalizeNodes(await this.rest('/api/nodes'))
    }
    return this.update(
      { nodes, fetchedAt: '', transport: this.mode },
      ids,
      true,
    )
  }
  async update(
    previous: Snapshot,
    ids?: string[],
    full = false,
  ): Promise<Snapshot> {
    let nodes: Snapshot['nodes'] = previous.nodes.map((n) => ({
      ...n,
      error: undefined,
    }))
    this.mode = previous.transport === 'rest' ? 'rest' : 'rpc'
    // Widgets request state only for their configured UUIDs; the app requests all.
    const targets = ids ? nodes.filter((n) => ids.includes(n.id)) : nodes
    if (this.mode === 'rpc') {
      try {
        const statuses = object(
          await this.rpc(
            'common:getNodesLatestStatus',
            ids ? { uuids: targets.map((n) => n.id) } : {},
          ),
        )
        for (const n of targets) {
          n.status = statuses[n.id] ? normalizeStatus(statuses[n.id]) : null
          if (n.status?.time)
            n.history = [
              ...n.history.filter((s) => s.time !== n.status!.time),
              sample(n.status),
            ]
              .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
              .slice(-240)
        }
      } catch (e) {
        if (e instanceof APIError && e.code === -32601) this.mode = 'rest'
        else throw e
      }
    }
    if (this.mode === 'rest') {
      // Older REST API has no HTTP presence endpoint. Never claim authoritative online/offline.
      await mapLimit(targets, 4, async (n) => {
        n.status = null
        try {
          const raw = await this.rest('/api/recent/' + encodeURIComponent(n.id))
          const list = Array.isArray(raw) ? raw : object(raw).records
          n.history = normalizeHistory(raw)
          if (Array.isArray(list) && list.length) {
            const latest = [...list].sort(
              (a, b) =>
                Date.parse(normalizeStatus(b).time) -
                Date.parse(normalizeStatus(a).time),
            )[0]
            n.status = normalizeStatus(latest)
            if (!full)
              n.status.ping =
                previous.nodes.find((o) => o.id === n.id)?.status?.ping || []
            else
              try {
                n.status.ping = normalizePingRecords(
                  await this.rest(
                    `/api/records/ping?uuid=${encodeURIComponent(n.id)}&hours=1`,
                  ),
                  n.id,
                )
              } catch {
                /* Probe endpoint is optional on older deployments. */
              }
          }
        } catch (e) {
          n.error = errorMessage(e)
        }
      })
    }
    if (full && ids && this.mode === 'rpc')
      await mapLimit(targets, 4, async (n) => {
        try {
          n.history = await this.recent(n.id)
        } catch {
          /* Optional chart must not turn a successful state fetch into a failure. */
        }
      })
    let site = previous.site
    if (full)
      try {
        const info = object(
          this.mode === 'rpc'
            ? await this.rpc('common:getPublicInfo')
            : await this.rest('/api/public'),
        )
        site = { ...site, title: text(info.sitename, '', 80) }
      } catch {
        /* Site branding must never block monitoring. */
      }
    return {
      nodes,
      site,
      fetchedAt: new Date().toISOString(),
      transport: this.mode,
      ...(this.mode === 'rest'
        ? { notice: '旧版 REST · 在线状态以近期上报代替' }
        : {}),
    }
  }
  async recent(id: string): Promise<Sample[]> {
    return normalizeHistory(
      this.mode === 'rpc'
        ? await this.rpc('common:getNodeRecentStatus', { uuid: id, limit: 120 })
        : await this.rest('/api/recent/' + encodeURIComponent(id)),
    )
  }
  async history(id: string, hours: number): Promise<Sample[]> {
    return normalizeHistory(
      this.mode === 'rpc'
        ? await this.rpc('common:getRecords', {
            type: 'load',
            uuid: id,
            hours,
            maxCount: 240,
          })
        : await this.rest(
            `/api/records/load?uuid=${encodeURIComponent(id)}&hours=${hours}&load_type=all`,
          ),
      id,
    )
  }
  async probes(id: string, hours: number) {
    return normalizeProbeHistory(
      this.mode === 'rpc'
        ? await this.rpc('common:getRecords', {
            type: 'ping',
            uuid: id,
            hours,
            maxCount: 240,
          })
        : await this.rest(
            `/api/records/ping?uuid=${encodeURIComponent(id)}&hours=${hours}`,
          ),
      id,
    )
  }
}
export async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++])
    }),
  )
}
