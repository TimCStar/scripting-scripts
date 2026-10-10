const { test } = require('node:test'),
  a = require('node:assert/strict'),
  { harness, walk } = require('../tools/harness.cjs')
const flush = () => new Promise((resolve) => setImmediate(resolve))
function setup() {
  const h = harness(),
    m = h.load('model.ts'),
    config = {
      ...m.defaultConfig(),
      demo: false,
      baseURL: 'https://example.com',
      revision: 'errors',
    }
  h.data.set('komari.config.v1', config)
  const timers = new Map()
  let next = 0,
    cursor = 0
  h.globals.setTimeout = (fn, ms) => {
    timers.set(++next, { fn, ms })
    return next
  }
  h.globals.clearTimeout = (id) => timers.delete(id)
  const slots = []
  h.bridge.useState = (initial) => {
    const index = cursor++
    if (!(index in slots))
      slots[index] = typeof initial === 'function' ? initial() : initial
    return [
      slots[index],
      (value) => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value
      },
    ]
  }
  const useMonitor = h.load('monitor.tsx').useMonitor
  return {
    h,
    config,
    timers,
    render() {
      cursor = 0
      return useMonitor()
    },
    async fire(ms) {
      const entry = [...timers].find(([, timer]) => timer.ms === ms)
      a.ok(entry, `expected timer ${ms} ms`)
      timers.delete(entry[0])
      await entry[1].fn()
      await flush()
    },
  }
}
function success(url, init) {
  if (!init.body) return Promise.resolve({ ok: false, status: 404 })
  const r = JSON.parse(init.body)
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({
      jsonrpc: '2.0',
      id: r.id,
      result:
        r.method === 'common:getNodes'
          ? { n1: { uuid: 'n1', name: 'Fixture' } }
          : r.method === 'common:getNodesLatestStatus'
            ? { n1: { online: true, cpu: 12, time: new Date().toISOString() } }
            : { sitename: 'Fixture monitor' },
    }),
  })
}
for (const [name, response, expected] of [
  ['authentication', { ok: false, status: 401 }, /无权读取/],
  ['server', { ok: false, status: 503 }, /HTTP 503/],
  [
    'invalid JSON',
    {
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('secret-response')
      },
    },
    /不是有效 JSON/,
  ],
])
  test(`${name} failure is visible, releases busy state and schedules recovery`, async () => {
    const s = setup()
    s.h.bridge.fetch = async () => response
    const monitor = s.render()
    monitor.appear()
    await flush()
    const failed = s.render()
    a.match(failed.error, expected)
    a.ok(!failed.error.includes('secret-response'))
    a.equal(failed.busy, false)
    a.match(failed.liveNote, /连接失败/)
    s.h.bridge.fetch = success
    await s.fire(6000)
    const recovered = s.render()
    a.equal(recovered.error, '')
    a.match(recovered.liveNote, /自动更新/)
    a.equal(recovered.snapshot.nodes.length, 1)
    recovered.disappear()
    a.equal(s.timers.size, 0)
  })

test('a native fetch that never settles times out, aborts and cannot overwrite recovery with a late response', async () => {
  const s = setup()
  let release, signal, late
  s.h.bridge.fetch = (url, init) => {
    signal = init.signal
    late = () => success(url, init)
    return new Promise((resolve) => {
      release = resolve
    })
  }
  s.render().appear()
  await flush()
  await s.fire(8000)
  a.equal(signal.aborted, true)
  a.match(s.render().error, /请求超时（8 秒）/)
  a.equal(s.render().busy, false)
  s.h.bridge.fetch = success
  await s.fire(6000)
  const current = s.render().snapshot
  release(await late())
  await flush()
  a.equal(s.render().snapshot, current)
  a.equal(s.render().error, '')
  s.render().disappear()
})

test('the same deadline covers a response body that never finishes decoding', async () => {
  const s = setup(),
    { KomariClient, errorMessage } = s.h.load('client.ts')
  let signal
  const client = new KomariClient(s.config.baseURL, '', async (_, init) => {
    signal = init.signal
    return { ok: true, status: 200, json: () => new Promise(() => {}) }
  })
  const request = client.request('/api/rpc2')
  const rejection = a.rejects(request, (e) => /请求超时/.test(errorMessage(e)))
  await flush()
  await s.fire(8000)
  await rejection
  a.equal(signal.aborted, true)
  a.equal(s.timers.size, 0)
})

test('an optional stalled favicon cannot leave successful monitoring stuck in connecting', async () => {
  const s = setup()
  s.h.bridge.fetch = (url, init) =>
    url.endsWith('/favicon.ico') ? new Promise(() => {}) : success(url, init)
  s.render().appear()
  await flush()
  await s.fire(4000)
  a.equal(s.render().error, '')
  a.equal(s.render().busy, false)
  a.equal(s.render().snapshot.nodes.length, 1)
  a.match(s.render().liveNote, /自动更新/)
  s.render().disappear()
})

test('module-exported scene events work without a global and clean up on unmount', async () => {
  const s = setup()
  a.equal('AppEvents' in s.h.globals, false)
  s.h.bridge.fetch = success
  s.render()
  const cleanup = s.h.effects[0]()
  s.render().appear()
  await flush()
  a.equal(s.render().error, '')
  a.match(s.render().liveNote, /自动更新/)
  a.equal(s.h.bridge.AppEvents.scenePhase.listeners.size, 1)
  s.h.bridge.AppEvents.scenePhase.emit('background')
  a.equal(s.render().liveNote, '已暂停')
  a.equal(s.timers.size, 1) // Only the appearance watchdog remains.
  s.h.bridge.AppEvents.scenePhase.emit('active')
  await flush()
  a.equal(s.render().error, '')
  a.match(s.render().liveNote, /自动更新/)
  cleanup()
  a.equal(s.h.bridge.AppEvents.scenePhase.listeners.size, 0)
  a.equal(s.timers.size, 0)
})

test('unavailable scene events report listener trouble while still loading the page', async () => {
  const s = setup()
  s.h.bridge.AppEvents = undefined
  s.h.bridge.fetch = success
  s.render().appear()
  await flush()
  a.match(s.render().error, /监听不可用/)
  a.ok(!s.render().error.includes('请更新'))
  a.match(s.render().liveNote, /自动更新/)
  a.equal(s.render().snapshot.nodes.length, 1)
  a.equal(s.render().busy, false)
  a.doesNotThrow(() => s.render().disappear())
})

test('manual refresh starts an unstarted page and unexpected refresh errors stay visible', async () => {
  const s = setup()
  s.h.load('state.ts').refresh = async () => {
    throw new Error('secret-internal-error')
  }
  await s.render().reload()
  await flush()
  a.match(s.render().error, /连接失败/)
  a.ok(!s.render().error.includes('secret-internal-error'))
  a.equal(s.render().busy, false)
  s.render().disappear()
})

test('both fullscreen destinations show the full error and an immediate retry action', async () => {
  const h = harness(),
    snapshot = h.load('model.ts').demoSnapshot()
  h.load('monitor.tsx').useMonitor = () => ({
    snapshot,
    config: h.load('model.ts').defaultConfig(),
    busy: false,
    liveNote: '连接失败 · 自动重试',
    error: '读取失败（HTTP 503）',
    reload: async () => {},
    appear() {},
    disappear() {},
  })
  h.load('index.tsx')
  await h.globals.completion
  for (const page of [
    h.load('index.tsx').Dashboard(),
    h.load('detail.tsx').Detail({ id: 'demo-1' }),
  ]) {
    const tree = walk(page)
    a.ok(
      tree.some(
        (n) =>
          n.type === 'Text' && n.children.join('') === '读取失败（HTTP 503）',
      ),
    )
    a.ok(
      tree.some(
        (n) =>
          n.type === 'Button' &&
          n.props.title === '立即重试' &&
          typeof n.props.action === 'function',
      ),
    )
  }
})

test('a missing native appearance callback reports startup trouble and manual retry recovers', async () => {
  const s = setup()
  s.render()
  const cleanup = s.h.effects[0]()
  await s.fire(8000)
  a.match(s.render().error, /尚未启动/)
  a.equal(s.render().liveNote, '尚未连接')
  s.h.bridge.fetch = success
  await s.render().reload()
  await flush()
  a.equal(s.render().error, '')
  a.equal(s.render().snapshot.nodes.length, 1)
  cleanup()
  a.equal(s.timers.size, 0)
  a.equal(s.h.bridge.AppEvents.scenePhase.listeners.size, 0)
})
