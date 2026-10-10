/** Komari wire data is untrusted. Only this allowlist reaches UI / persistent cache. */
export type Config = {
  version: 1
  baseURL: string
  demo: boolean
  revision: string
  refreshMinutes: number
  selections: Record<Family, string[]>
}
export type Family = 'systemSmall' | 'systemMedium' | 'systemLarge'
export type Sample = {
  time: string
  cpu: number | null
  memory: number | null
  disk: number | null
  up: number | null
  down: number | null
}
export type Status = Sample & {
  online: boolean | null
  ramUsed: number | null
  ramTotal: number | null
  diskUsed: number | null
  diskTotal: number | null
  swapUsed: number | null
  swapTotal: number | null
  totalUp: number | null
  totalDown: number | null
  trafficUp: number | null
  trafficDown: number | null
  uptime: number | null
  load: number | null
  load5: number | null
  load15: number | null
  process: number | null
  tcp: number | null
  udp: number | null
  ping: {
    name: string
    latest: number | null
    avg: number | null
    loss: number | null
  }[]
}
export type Node = {
  id: string
  name: string
  region: string
  group: string
  tags: string
  cpuName: string
  cores: number | null
  os: string
  arch: string
  kernel: string
  virtualization: string
  remark: string
  weight: number
  expires: string
  price: number | null
  currency: string
  billing: number | null
  trafficLimit: number | null
  trafficType: string
  memoryTotal: number | null
  diskTotal: number | null
  status: Status | null
  history: Sample[]
  error?: string
}
export type Snapshot = {
  nodes: Node[]
  fetchedAt: string
  transport: 'rpc' | 'rest' | 'demo'
  notice?: string
  cached?: boolean
  site?: { title: string; icon?: string; iconCheckedAt?: string }
}
export function object(x: unknown): Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {}
}
export function num(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null
}
export function text(x: unknown, fallback = '', max = 120): string {
  return typeof x === 'string'
    ? x
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, max) || fallback
    : fallback
}
export function iso(x: unknown): string {
  return typeof x === 'string' &&
    Number.isFinite(Date.parse(x)) &&
    Date.parse(x) > 0
    ? new Date(x).toISOString()
    : ''
}
export function ratio(used: unknown, total: unknown): number | null {
  const u = num(used),
    t = num(total)
  return u !== null && t !== null && t > 0 ? (u / t) * 100 : null
}
export function normalizeURL(raw: string): string {
  // Scripting is a native JS host; do not depend on browser URL globals.
  const value = raw.trim(),
    match = /^https:\/\/([^/]+)(\/.*)?$/i.exec(value)
  if (!match || /[\s\u0000-\u001f\u007f\\@?#]/.test(value))
    throw new Error('请输入完整的 HTTPS 站点地址，不能包含凭证、查询参数或片段')
  const authority = /^(\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9.-]+)(?::([0-9]+))?$/.exec(
    match[1],
  )
  if (!authority) throw new Error('地址域名或端口无效')
  const host = authority[1].toLowerCase(),
    port = authority[2] ? Number(authority[2]) : 443
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('地址端口无效')
  if (host.startsWith('[')) {
    if (!host.includes(':') || host.includes(':::'))
      throw new Error('地址 IPv6 无效')
  } else if (
    host
      .split('.')
      .some(
        (label) =>
          !label ||
          label.length > 63 ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  )
    throw new Error('地址域名无效')
  const path = (match[2] || '').replace(/\/+$/, '')
  if (
    /%(?![0-9a-fA-F]{2})|%(?:2e|2f|5c|40|00)/i.test(path) ||
    path.split('/').some((p) => p === '.' || p === '..')
  )
    throw new Error('地址部署路径含不明确的编码')
  if (/\/api(?:\/|$)/i.test(path))
    throw new Error('请填写站点地址，不要包含 /api')
  return 'https://' + host + (port === 443 ? '' : ':' + port) + path
}
export function validID(x: unknown): x is string {
  return typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x)
}
export const families: Family[] = ['systemSmall', 'systemMedium', 'systemLarge']
export function capacity(f: Family): number {
  return f === 'systemSmall' ? 1 : f === 'systemMedium' ? 2 : 4
}
export function defaultConfig(): Config {
  return {
    version: 1,
    baseURL: '',
    demo: true,
    revision: 'initial',
    refreshMinutes: 15,
    selections: { systemSmall: [], systemMedium: [], systemLarge: [] },
  }
}
export function parseConfig(raw: unknown): Config {
  const r = object(raw),
    d = defaultConfig()
  if (r.version !== 1) return d
  const s = object(r.selections)
  for (const f of families)
    d.selections[f] = Array.isArray(s[f])
      ? (s[f] as unknown[])
          .filter(validID)
          .filter((x, i, a) => a.indexOf(x) === i)
          .slice(0, capacity(f))
      : []
  d.demo = r.demo !== false
  d.revision = text(r.revision, 'initial', 80)
  d.refreshMinutes = [5, 15, 30, 60].includes(Number(r.refreshMinutes))
    ? Number(r.refreshMinutes)
    : 15
  if (!d.demo) d.baseURL = normalizeURL(text(r.baseURL, '', 2048))
  else d.baseURL = text(r.baseURL, '', 2048)
  return d
}
export function normalizeStatus(raw: unknown): Status {
  const r = object(raw),
    cpu = object(r.cpu),
    ram = object(r.ram),
    disk = object(r.disk),
    swap = object(r.swap),
    net = object(r.network),
    load = object(r.load),
    conn = object(r.connections)
  const nested = typeof r.cpu === 'object'
  const ru = nested ? ram.used : r.ram,
    rt = nested ? ram.total : r.ram_total,
    du = nested ? disk.used : r.disk,
    dt = nested ? disk.total : r.disk_total
  // RPC `connections` is TCP + UDP; nested report contains TCP separately.
  const udp = num(nested ? conn.udp : r.connections_udp),
    connections = num(r.connections)
  return {
    time: iso(r.time) || iso(r.updated_at),
    cpu: num(nested ? cpu.usage : r.cpu),
    memory: ratio(ru, rt),
    disk: ratio(du, dt),
    ramUsed: num(ru),
    ramTotal: num(rt),
    diskUsed: num(du),
    diskTotal: num(dt),
    swapUsed: num(nested ? swap.used : r.swap),
    swapTotal: num(nested ? swap.total : r.swap_total),
    up: num(nested ? net.up : r.net_out),
    down: num(nested ? net.down : r.net_in),
    totalUp: num(nested ? net.totalUp : r.net_total_up),
    totalDown: num(nested ? net.totalDown : r.net_total_down),
    trafficUp: num(r.traffic_up),
    trafficDown: num(r.traffic_down),
    uptime: num(r.uptime),
    load: num(nested ? load.load1 : r.load),
    load5: num(nested ? load.load5 : r.load5),
    load15: num(nested ? load.load15 : r.load15),
    process: num(r.process),
    tcp: nested
      ? num(conn.tcp)
      : connections !== null && udp !== null
        ? Math.max(0, connections - udp)
        : null,
    udp,
    online: typeof r.online === 'boolean' ? r.online : null,
    ping: Object.values(object(r.ping)).map((p) => {
      const v = object(p)
      return {
        name: text(v.name, '探测任务'),
        latest: num(v.latest),
        avg: v.loss === 100 ? null : num(v.avg),
        loss:
          num(v.loss) !== null && Number(v.loss) <= 100 ? num(v.loss) : null,
      }
    }),
  }
}
export function sample(s: Sample): Sample {
  return {
    time: s.time,
    cpu: s.cpu,
    memory: s.memory,
    disk: s.disk,
    up: s.up,
    down: s.down,
  }
}
export function normalizeNodes(raw: unknown): Node[] {
  if (!Array.isArray(raw) && (raw === null || typeof raw !== 'object'))
    throw new Error('节点列表格式不正确')
  const entries = Array.isArray(raw)
    ? raw.map((v) => ['', v] as const)
    : Object.entries(object(raw))
  const seen = new Set<string>()
  return entries
    .map(([key, value]) => {
      const r = object(value),
        id = text(r.uuid, key, 100)
      if (!validID(id) || seen.has(id))
        throw new Error('节点 UUID 缺失、重复或无效')
      seen.add(id)
      return {
        id,
        name: text(r.name, '未命名 VPS', 80),
        region: text(r.region, 'GLOBAL', 30),
        group: text(r.group, '未分组', 80),
        tags: text(r.tags, '', 200),
        cpuName: text(r.cpu_name, '—'),
        cores: num(r.cpu_cores),
        os: text(r.os, '—'),
        arch: text(r.arch, '—'),
        kernel: text(r.kernel_version, '—'),
        virtualization: text(r.virtualization, '—'),
        remark: text(r.public_remark, '', 500),
        weight:
          typeof r.weight === 'number' && Number.isFinite(r.weight)
            ? r.weight
            : 0,
        expires: iso(r.expired_at),
        price: num(r.price),
        currency: text(r.currency, '', 12),
        billing: num(r.billing_cycle),
        trafficLimit: num(r.traffic_limit),
        trafficType: text(r.traffic_limit_type, 'max', 10),
        memoryTotal: num(r.mem_total),
        diskTotal: num(r.disk_total),
        status: null,
        history: [],
      } satisfies Node
    })
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
}
export function normalizeHistory(raw: unknown, id?: string): Sample[] {
  let list: unknown = Array.isArray(raw) ? raw : object(raw).records
  // common:getRecords returns records grouped by UUID, unlike REST/recent arrays.
  if (list && typeof list === 'object' && !Array.isArray(list))
    list = id ? (object(list)[id] ?? []) : Object.values(object(list)).flat()
  if (!Array.isArray(list) && list !== null)
    throw new Error('历史记录格式不正确')
  const byTime = new Map<string, Sample>()
  for (const r of list || []) {
    if (id && object(r).client && object(r).client !== id) continue
    const s = normalizeStatus(r)
    if (s.time) byTime.set(s.time, sample(s))
  }
  const all = [...byTime.values()].sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time),
  )
  return all.length <= 240
    ? all
    : Array.from(
        { length: 240 },
        (_, i) => all[Math.round((i * (all.length - 1)) / 239)],
      )
}
export function selectedIDs(
  c: Config,
  nodes: Node[],
  family: Family,
  parameter = '',
): string[] {
  const requested = parameter.trim()
    ? parameter.trim().split(/[,，\s]+/)
    : c.selections[family]
  if (requested.some((id) => !validID(id)))
    throw new Error('组件参数只接受逗号分隔的 VPS UUID')
  const ids = requested.length
    ? [...new Set(requested)].slice(0, capacity(family))
    : nodes.slice(0, capacity(family)).map((n) => n.id)
  if (ids.some((id) => !nodes.some((n) => n.id === id)))
    throw new Error('所选 VPS 已移除或不可见，请重新选择')
  return ids
}
export function state(
  n: Node,
  cached = false,
  now = Date.now(),
): 'online' | 'offline' | 'recent' | 'stale' | 'unknown' {
  if (cached || n.error) return 'unknown'
  const s = n.status
  if (!s) return 'unknown'
  if (s.online === false) return 'offline'
  const age = now - Date.parse(s.time)
  if (!s.time || age < -60_000) return 'unknown'
  if (age > 120_000) return 'stale'
  return s.online === true ? 'online' : 'recent'
}
export const stateLabel = {
  online: '在线',
  offline: '离线',
  recent: '近期上报',
  stale: '上报过期',
  unknown: '状态未知',
}
export function percent(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}%`
}
export function bytes(v: number | null): string {
  if (v === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i && v < 100 ? 1 : 0)} ${units[i]}`
}
export function speed(v: number | null): string {
  return v === null ? '—' : bytes(v) + '/s'
}
export function uptime(v: number | null): string {
  if (v === null) return '—'
  const d = Math.floor(v / 86400),
    h = Math.floor((v % 86400) / 3600),
    m = Math.floor((v % 3600) / 60)
  return d ? `${d}天 ${h}时` : h ? `${h}时 ${m}分` : `${m}分`
}
export function timeLabel(time: string): string {
  return time
    ? new Date(time).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '未更新'
}
export function expiry(time: string, now = Date.now()): string {
  if (!time) return '未提供到期时间'
  const days = Math.ceil((Date.parse(time) - now) / 86400_000)
  return days <= 0 ? '已到期' : `${days} 天后到期`
}
export function traffic(n: Node): number | null {
  const s = n.status
  if (!s) return null
  // Komari's quota indicator uses agent cumulative counters. traffic_up/down
  // in historical records are interval deltas, not billing-period counters.
  const u = s.totalUp,
    d = s.totalDown
  if (n.trafficType === 'up') return u
  if (n.trafficType === 'down') return d
  if (u === null || d === null) return null
  return n.trafficType === 'sum'
    ? u + d
    : n.trafficType === 'min'
      ? Math.min(u, d)
      : Math.max(u, d)
}
export function lossLabel(value: number | null): string {
  return value === null ? '—' : `${Number(value.toFixed(1))}%`
}
export function latency(value: number | null): string {
  return value === null ? '—' : `${Number(value.toFixed(1))} ms`
}
/** Overview explicitly uses the first task; never mix latency and loss from different probes. */
export function probe(n: Node) {
  return (
    n.status?.ping[0] || {
      name: '未配置探测',
      latest: null,
      avg: null,
      loss: null,
    }
  )
}
export function normalizePingRecords(raw: unknown, id: string): Status['ping'] {
  const r = object(raw),
    tasks = Array.isArray(r.tasks) ? r.tasks : [],
    records = Array.isArray(r.records) ? r.records : []
  return tasks.map((task) => {
    const t = object(task),
      rows = records
        .map(object)
        .filter(
          (p) =>
            (!p.client || p.client === id) &&
            p.task_id === t.id &&
            iso(p.time) &&
            typeof p.value === 'number' &&
            Number.isFinite(p.value),
        )
        .sort((a, b) => Date.parse(String(a.time)) - Date.parse(String(b.time)))
    const valid = rows.filter((p) => Number(p.value) >= 0)
    return {
      name: text(t.name, '探测任务'),
      latest: valid.length ? num(valid.at(-1)!.value) : null,
      avg: valid.length
        ? valid.reduce((s, p) => s + Number(p.value), 0) / valid.length
        : null,
      loss: rows.length
        ? ((rows.length - valid.length) / rows.length) * 100
        : null,
    }
  })
}
export type ProbeHistory = {
  name: string
  latest: number | null
  avg: number | null
  loss: number | null
  points: { time: string; value: number | null }[]
}
export function normalizeProbeHistory(
  raw: unknown,
  id: string,
): ProbeHistory[] {
  const r = object(raw),
    tasks = Array.isArray(r.tasks) ? r.tasks : [],
    rows = Array.isArray(r.records) ? r.records.map(object) : [],
    summaries = normalizePingRecords(raw, id)
  return tasks.map((task) => {
    const t = object(task),
      points = rows
        .filter(
          (p) =>
            p.task_id === t.id && (!p.client || p.client === id) && iso(p.time),
        )
        .map((p) => ({ time: iso(p.time), value: num(p.value) }))
        .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
    // Server calculates summaries before downsampling: don't compute loss from sampled points.
    const summary = summaries.find((p) => p.name === text(t.name, '探测任务'))
    return {
      name: text(t.name, '探测任务'),
      latest: num(t.latest) ?? summary?.latest ?? null,
      avg:
        t.total === 0 || t.loss === 100
          ? null
          : (num(t.avg) ?? summary?.avg ?? null),
      loss: t.total === 0 ? null : (num(t.loss) ?? summary?.loss ?? null),
      points:
        points.length <= 240
          ? points
          : Array.from(
              { length: 240 },
              (_, i) => points[Math.round((i * (points.length - 1)) / 239)],
            ),
    }
  })
}
export function demoSnapshot(now = Date.now()): Snapshot {
  const nodes = normalizeNodes(
    ['Tokyo Edge', 'Singapore Core', 'Frankfurt Lab', 'Los Angeles Relay'].map(
      (name, i) => ({
        uuid: `demo-${i + 1}`,
        name,
        weight: 4 - i,
        region: ['JP', 'SG', 'DE', 'US'][i],
        group: i < 2 ? 'Production' : 'Lab',
        cpu_name: 'AMD EPYC 7B13',
        cpu_cores: [2, 4, 2, 1][i],
        os: 'Debian 12',
        arch: 'x86_64',
        virtualization: 'KVM',
        kernel_version: '6.1.0',
        mem_total: 4 * 1024 ** 3,
        disk_total: 80 * 1024 ** 3,
        expired_at: new Date(now + (i + 1) * 12 * 86400_000).toISOString(),
        public_remark: '演示节点，所有监控数值均为虚构。',
        traffic_limit: 1024 ** 4,
        traffic_limit_type: 'sum',
      }),
    ),
  )
  nodes.forEach((n, i) => {
    n.status = normalizeStatus({
      time: new Date(now - (i === 3 ? 300_000 : 3000)).toISOString(),
      cpu: [18, 42, 7, 0][i],
      ram: (i + 1) * 0.5 * 1024 ** 3,
      ram_total: 4 * 1024 ** 3,
      disk: (i + 1) * 9 * 1024 ** 3,
      disk_total: 80 * 1024 ** 3,
      swap: 0,
      swap_total: 1024 ** 3,
      net_out: (i + 1) * 120 * 1024,
      net_in: (i + 1) * 1.4 * 1024 ** 2,
      net_total_up: 18 * 1024 ** 3,
      net_total_down: 92 * 1024 ** 3,
      traffic_up: 15 * 1024 ** 3,
      traffic_down: 80 * 1024 ** 3,
      uptime: 1284000 + i * 4800,
      online: i !== 3,
      load: 0.24,
      load5: 0.18,
      load15: 0.12,
      process: 102,
      connections: 42,
      connections_udp: 7,
      ping: {
        '1': {
          name: 'Cloudflare',
          latest: 12 + i * 7,
          avg: 15 + i * 6,
          loss: 0,
        },
      },
    })
    n.history = Array.from({ length: 24 }, (_, j) => ({
      ...sample(n.status!),
      time: new Date(now - (24 - j) * 30000).toISOString(),
      cpu: Math.max(0, [18, 42, 7, 0][i] + Math.sin(j * 0.7 + i) * 8),
      memory: 20 + i * 12 + Math.sin(j * 0.3) * 3,
    }))
  })
  return {
    nodes,
    fetchedAt: new Date(now).toISOString(),
    transport: 'demo',
    site: { title: '云端观测' },
    notice: '演示 · 虚构数据',
  }
}
