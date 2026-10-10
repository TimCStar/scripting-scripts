const { test } = require('node:test'),
  a = require('node:assert/strict'),
  { harness } = require('../tools/harness.cjs')
const m = harness().load('model.ts'),
  { KomariClient } = harness().load('client.ts')
const now = Date.now(),
  wire = {
    uuid: 'node-1',
    name: 'Tokyo',
    mem_total: 4096,
    disk_total: 8192,
    token: 'never-cache',
    ipv4: 'sensitive',
    remark: 'private',
    public_remark: 'public',
  }
const flat = {
  client: 'node-1',
  time: new Date(now).toISOString(),
  cpu: 0,
  ram: 1024,
  ram_total: 4096,
  disk: 4096,
  disk_total: 8192,
  net_in: 0,
  net_out: 1024,
  online: true,
  connections: 12,
  connections_udp: 3,
}
const ok = (data) => ({ ok: true, status: 200, json: async () => data })
const rpcFetch =
  (respond, calls = []) =>
  async (url, init) => {
    calls.push({ url, init })
    return ok(respond(JSON.parse(init.body)))
  }
test('flat zero/missing/invalid values and TCP+UDP have accurate semantics', () => {
  const s = m.normalizeStatus(flat)
  a.equal(s.cpu, 0)
  a.equal(s.memory, 25)
  a.equal(s.disk, 50)
  a.equal(s.tcp, 9)
  a.equal(s.down, 0)
  a.equal(s.uptime, null)
  for (const v of [null, undefined, '10', NaN, Infinity, -1])
    a.equal(m.num(v), null)
  a.equal(m.ratio(0, 0), null)
})
test('nested REST report has the same normalized resources', () => {
  const s = m.normalizeStatus({
    updated_at: flat.time,
    cpu: { usage: 0 },
    ram: { used: 1024, total: 4096 },
    disk: { used: 4096, total: 8192 },
    network: { up: 1024, down: 0, totalUp: 40, totalDown: 50 },
    connections: { tcp: 9, udp: 3 },
  })
  a.equal(s.memory, 25)
  a.equal(s.cpu, 0)
  a.equal(s.tcp, 9)
  a.equal(s.down, 0)
  a.equal(s.online, null)
})
test('only public display allowlist survives node normalization', () => {
  const n = m.normalizeNodes([wire])[0]
  a.equal(n.remark, 'public')
  for (const field of ['token', 'ipv4', 'remark_private', 'version'])
    a.equal(n[field], undefined)
  a.throws(() => m.normalizeNodes([wire, wire]))
  a.throws(() => m.normalizeNodes([{ name: 'missing UUID' }]))
})
test('HTTPS URL rejects embedded credentials, queries, API path and keeps deployment prefix', () => {
  a.equal(
    m.normalizeURL(' https://example.com/komari/ '),
    'https://example.com/komari',
  )
  for (const u of [
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com?a=b',
    'https://example.com/#x',
    'https://example.com/api',
  ])
    a.throws(() => m.normalizeURL(u))
})
test('native-host URL normalization canonicalizes ports and rejects ambiguous paths', () => {
  a.equal(
    m.normalizeURL('HTTPS://EXAMPLE.com:443/prefix/'),
    'https://example.com/prefix',
  )
  a.equal(
    m.normalizeURL('https://example.com:8443'),
    'https://example.com:8443',
  )
  for (const u of [
    'https://example.com:0',
    'https://example.com:65536',
    'https://example.com/../komari',
    'https://example.com/%2e%2e/',
    'https://example.com\\evil',
    'https://bad..example.com',
    'https://example.com/%GG',
  ])
    a.throws(() => m.normalizeURL(u))
})
test('explicit offline, expired/future/missing and cached status are distinct', () => {
  const n = m.normalizeNodes([wire])[0]
  n.status = m.normalizeStatus(flat)
  a.equal(m.state(n, false, now), 'online')
  a.equal(m.state(n, true, now), 'unknown')
  n.status.online = false
  a.equal(m.state(n, false, now), 'offline')
  n.status.online = null
  a.equal(m.state(n, false, now), 'recent')
  a.equal(m.state(n, false, now + 121000), 'stale')
  n.status.time = new Date(now + 120000).toISOString()
  a.equal(m.state(n, false, now), 'unknown')
})
test('UUID selection is ordered, size limited, explicit invalid/removed choices never substitute another VPS', () => {
  const c = m.defaultConfig(),
    nodes = m.demoSnapshot().nodes
  c.selections.systemLarge = ['demo-3', 'demo-1']
  a.deepEqual(Array.from(m.selectedIDs(c, nodes, 'systemLarge')), [
    'demo-3',
    'demo-1',
  ])
  a.deepEqual(
    Array.from(m.selectedIDs(c, nodes, 'systemSmall', 'demo-2,demo-1')),
    ['demo-2'],
  )
  a.throws(() => m.selectedIDs(c, nodes, 'systemSmall', 'unknown'))
  a.throws(() => m.selectedIDs(c, nodes, 'systemSmall', 'https://bad'))
  a.equal(m.selectedIDs(c, nodes, 'systemLarge').length, 2)
})
test('grouped RPC history isolates node and preserves full time span when sampling', () => {
  const records = Array.from({ length: 1000 }, (_, i) => ({
    ...flat,
    time: new Date(now + i * 1000).toISOString(),
    cpu: i % 100,
  }))
  const h = m.normalizeHistory(
    {
      records: {
        'node-1': records,
        'node-2': [{ ...flat, client: 'node-2', cpu: 90 }],
      },
    },
    'node-1',
  )
  a.equal(h.length, 240)
  a.equal(h[0].time, records[0].time)
  a.equal(h.at(-1).time, records.at(-1).time)
  a.equal(m.normalizeHistory({ records: {} }, 'node-1').length, 0)
})
test('history sorts, deduplicates, drops invalid timestamps and preserves missing metric', () => {
  const h = m.normalizeHistory([
    { ...flat, time: 'invalid' },
    { ...flat, time: new Date(now + 1000).toISOString(), cpu: null },
    flat,
    flat,
  ])
  a.equal(h.length, 2)
  a.equal(h[0].cpu, 0)
  a.equal(h[1].cpu, null)
})
test('traffic quota follows cumulative counters and all server calculation modes, never interval deltas', () => {
  const n = m.normalizeNodes([{ ...wire, traffic_limit_type: 'sum' }])[0]
  n.status = m.normalizeStatus({
    ...flat,
    net_total_up: 1000,
    net_total_down: 2000,
    traffic_up: 10,
    traffic_down: 20,
  })
  for (const [type, value] of [
    ['sum', 3000],
    ['max', 2000],
    ['min', 1000],
    ['up', 1000],
    ['down', 2000],
  ]) {
    n.trafficType = type
    a.equal(m.traffic(n), value)
  }
  n.status.totalDown = null
  a.equal(m.traffic(n), null)
  n.trafficType = 'up'
  n.status.totalUp = 0
  a.equal(m.traffic(n), 0)
})

test('RPC snapshot and detail use read-only methods, prefix, matching ID and maxCount spelling', async () => {
  const calls = [],
    client = new KomariClient(
      'https://example.com/prefix',
      'fixture',
      rpcFetch(
        (r) => ({
          jsonrpc: '2.0',
          id: r.id,
          result:
            r.method === 'common:getNodes'
              ? { 'node-1': wire }
              : r.method === 'common:getNodesLatestStatus'
                ? { 'node-1': flat }
                : { records: { 'node-1': [flat] } },
        }),
        calls,
      ),
    )
  const s = await client.snapshot()
  a.equal(s.nodes[0].status.cpu, 0)
  a.equal((await client.history('node-1', 24)).length, 1)
  for (const { url, init } of calls) {
    a.equal(url, 'https://example.com/prefix/api/rpc2')
    a.equal(init.headers.Authorization, 'Bearer fixture')
    a.equal(await init.handleRedirect(), null)
    a.equal(init.timeout, 8)
    a.match(JSON.parse(init.body).method, /^common:get/)
  }
  a.equal(JSON.parse(calls.at(-1).init.body).params.maxCount, 240)
})
test('unsupported RPC falls back to REST and never invents online status', async () => {
  const calls = [],
    client = new KomariClient('https://example.com', '', async (url, init) => {
      calls.push(url)
      if (url.endsWith('/rpc2'))
        return { ok: false, status: 404, json: async () => ({}) }
      return ok({
        status: 'success',
        data: url.endsWith('/nodes')
          ? [wire]
          : [
              {
                updated_at: flat.time,
                cpu: { usage: 0 },
                ram: { used: 1, total: 2 },
              },
            ],
      })
    })
  const s = await client.snapshot()
  a.equal(s.transport, 'rest')
  a.equal(s.nodes[0].status.online, null)
  a.equal(m.state(s.nodes[0]), 'recent')
  a.equal(calls.length, 5)
})
test('RPC authentication failure never probes REST and suppresses server error text', async () => {
  let calls = 0
  const client = new KomariClient(
    'https://example.com',
    'fixture',
    rpcFetch((r) => {
      calls++
      return {
        jsonrpc: '2.0',
        id: r.id,
        error: { code: -32041, message: 'secret-token' },
      }
    }),
  )
  await a.rejects(
    () => client.snapshot(),
    (e) => !e.message.includes('secret-token'),
  )
  a.equal(calls, 1)
})
test('older RPC with no latest-status method uses REST reports', async () => {
  const client = new KomariClient(
    'https://example.com',
    '',
    async (url, init) => {
      if (init.body) {
        const r = JSON.parse(init.body)
        return ok({
          jsonrpc: '2.0',
          id: r.id,
          ...(r.method === 'common:getNodes'
            ? { result: { 'node-1': wire } }
            : { error: { code: -32601 } }),
        })
      }
      return ok({ status: 'success', data: [{ ...flat, online: undefined }] })
    },
  )
  const s = await client.snapshot()
  a.equal(s.transport, 'rest')
  a.equal(s.nodes[0].status.cpu, 0)
  a.equal(s.nodes[0].status.online, null)
})
test('RPC transport error and mismatched response ID never silently downgrade', async () => {
  for (const result of [
    { ok: false, status: 500, json: async () => ({}) },
    ok({ jsonrpc: '2.0', id: 999, result: [] }),
  ]) {
    let calls = 0
    const c = new KomariClient('https://example.com', '', async () => {
      calls++
      return result
    })
    await a.rejects(() => c.snapshot())
    a.equal(calls, 1)
  }
})
test('REST per-node failures preserve other nodes and concurrency limit', async () => {
  let active = 0,
    max = 0
  const nodes = Array.from({ length: 9 }, (_, i) => ({
    ...wire,
    uuid: 'node-' + i,
  }))
  const c = new KomariClient('https://example.com', '', async (url) => {
    if (url.endsWith('/rpc2')) return { ok: false, status: 404 }
    if (url.endsWith('/nodes')) return ok({ status: 'success', data: nodes })
    active++
    max = Math.max(max, active)
    await new Promise((r) => setTimeout(r, 3))
    active--
    if (url.endsWith('node-4')) throw Error('failed')
    return ok({ status: 'success', data: [flat] })
  })
  const s = await c.snapshot()
  a.equal(max, 4)
  a.equal(s.nodes.filter((n) => n.error).length, 1)
  a.equal(s.nodes.filter((n) => n.status).length, 8)
})

test('REST probes keep real zero and compute loss per task without mixing nodes', () => {
  const time = new Date().toISOString()
  const p = m.normalizePingRecords(
    {
      tasks: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      records: [
        { task_id: 1, client: 'node-1', time, value: 0 },
        { task_id: 1, client: 'node-1', time, value: -1 },
        { task_id: 1, client: 'another', time, value: 999 },
        { task_id: 2, client: 'node-1', time, value: -1 },
      ],
    },
    'node-1',
  )
  a.equal(p[0].loss, 50)
  a.equal(p[0].avg, 0)
  a.equal(p[0].latest, 0)
  a.equal(p[1].loss, 100)
  a.equal(p[1].avg, null)
})
test('node probe summary averages all task means instead of the first or latest reading', () => {
  const node = m.demoSnapshot().nodes[0]
  node.status.ping = m.normalizeStatus({
    ping: {
      a: { name: 'A', latest: 900, avg: 20, loss: 10 },
      b: { name: 'B', latest: 800, avg: 60, loss: 30 },
    },
  }).ping
  const summary = m.probe(node)
  a.equal(summary.avg, 40)
  a.equal(summary.loss, 20)
  a.equal(summary.name, '2 项探测均值')
  node.status.ping.reverse()
  a.deepEqual(m.probe(node), summary)
})

test('probe averages preserve zero, skip missing values and include fully failed tasks in loss', () => {
  const node = m.demoSnapshot().nodes[0]
  node.status.ping = [
    { name: 'Zero', latest: 10, avg: 0, loss: 0 },
    { name: 'Failed', latest: null, avg: 0, loss: 100 },
    { name: 'Unknown', latest: 999, avg: null, loss: null },
  ]
  a.equal(m.probe(node).avg, 0)
  a.equal(m.probe(node).loss, 50)
  node.status.ping = [node.status.ping[1]]
  a.equal(m.probe(node).avg, null)
  a.equal(m.probe(node).loss, 100)
})

test('probe averages handle one task, invalid cached values and absent data without a latest fallback', () => {
  const node = m.demoSnapshot().nodes[0]
  node.status.ping = [
    { name: 'Valid', latest: 900, avg: 47, loss: 2.4 },
    { name: 'Invalid', latest: 800, avg: Infinity, loss: 101 },
    { name: 'Negative', latest: -1, avg: -1, loss: -1 },
    { name: 'Unknown', latest: 700, avg: NaN, loss: NaN },
  ]
  a.equal(m.probe(node).avg, 47)
  a.equal(m.probe(node).loss, 2.4)
  node.status.ping = []
  a.equal(m.probe(node).avg, null)
  a.equal(m.probe(node).loss, null)
  a.equal(m.probe(node).name, '未配置探测')
  node.status = null
  a.equal(m.probe(node).avg, null)
  a.equal(m.probe(node).loss, null)
})

test('downsampled probe chart uses full-window server summaries and preserves timeout gaps', () => {
  const time = new Date().toISOString()
  const p = m.normalizeProbeHistory(
    {
      tasks: [{ id: 1, name: 'A', total: 100, loss: 25, avg: 15, latest: 17 }],
      records: [{ task_id: 1, client: 'node-1', time, value: -1 }],
    },
    'node-1',
  )[0]
  a.equal(p.loss, 25)
  a.equal(p.avg, 15)
  a.equal(p.latest, 17)
  a.equal(p.points[0].value, null)
})
test('status-only refresh makes one RPC read, retains branding and normalized chart readings', async () => {
  const calls = [],
    previous = m.demoSnapshot(),
    client = new KomariClient(
      'https://example.com',
      'fixture',
      rpcFetch(
        (r) => ({
          jsonrpc: '2.0',
          id: r.id,
          result: { 'demo-1': { ...flat, time: new Date().toISOString() } },
        }),
        calls,
      ),
    )
  previous.transport = 'rpc'
  const result = await client.update(previous)
  a.equal(calls.length, 1)
  a.equal(result.site.title, previous.site.title)
  a.equal(
    result.nodes[0].history[0].memory,
    previous.nodes[0].history[0].memory,
  )
  a.equal(result.nodes[0].history[0].down, previous.nodes[0].history[0].down)
  a.equal(result.nodes[1].status, null)
})
