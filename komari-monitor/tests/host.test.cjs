const { test } = require('node:test'),
  a = require('node:assert/strict'),
  { harness, walk } = require('../tools/harness.cjs')
function setup(options = {}) {
  const h = harness(options),
    m = h.load('model.ts'),
    c = {
      ...m.defaultConfig(),
      demo: false,
      baseURL: 'https://example.com',
      revision: 'r1',
    }
  h.data.set('komari.config.v1', c)
  return { h, m, c, s: h.load('state.ts') }
}
function fetcher(h, { fail = false, change = false } = {}) {
  let count = 0
  h.bridge.fetch = async (url, init) => {
    count++
    if (fail) throw Error('network failed fixture token')
    if (!init.body) return { ok: false, status: 404 }
    const r = JSON.parse(init.body)
    if (change)
      h.data.set('komari.config.v1', {
        ...h.data.get('komari.config.v1'),
        revision: 'r2',
      })
    return {
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        id: r.id,
        result:
          r.method === 'common:getNodes'
            ? { n1: { uuid: 'n1', name: 'Fresh' } }
            : r.method === 'common:getNodesLatestStatus'
              ? { n1: { cpu: 0, online: true, time: new Date().toISOString() } }
              : r.method === 'common:getPublicInfo'
                ? { sitename: '星海监控' }
                : { records: [] },
      }),
    }
  }
  return () => count
}
test('demo widget has no network/keychain requirement', async () => {
  const h = harness()
  h.load('widget.tsx')
  await h.globals.completion
  a.ok(h.result.view)
  a.ok(
    walk(h.result.view).some(
      (n) => n.type === 'Text' && n.children.join('').includes('演示'),
    ),
  )
  a.equal(h.keys.size, 0)
})
test('failure keeps original sampling time and greys out cached online status', async () => {
  const { h, s, c, m } = setup()
  const count = fetcher(h)
  const fresh = await s.refresh(c)
  a.equal(count(), 4)
  a.equal(fresh.nodes[0].status.cpu, 0)
  fetcher(h, { fail: true })
  const old = await s.refresh(c)
  a.equal(old.fetchedAt, fresh.fetchedAt)
  a.equal(old.cached, true)
  a.equal(m.state(old.nodes[0], old.cached), 'unknown')
  a.ok(!old.notice.includes('fixture token'))
})
test('credential is bound to exact site and never stored in snapshot', async () => {
  const { h, s, c } = setup()
  s.saveConfig(c, 'fixture-secret')
  a.equal(s.readToken(c), 'fixture-secret')
  a.equal(s.readToken({ ...c, baseURL: 'https://another.example.com' }), '')
  fetcher(h)
  await s.refresh(c)
  a.ok(!JSON.stringify(h.data.get(s.CACHE_KEY)).includes('fixture-secret'))
  a.ok([...h.keys.values()][0].includes('fixture-secret'))
})
test('configuration change during request discards response and forbids cache write', async () => {
  const { h, s, c } = setup()
  fetcher(h, { change: true })
  const result = await s.refresh(c)
  a.equal(result.nodes.length, 0)
  a.ok(result.notice.includes('配置已改变'))
  a.equal(h.data.get(s.CACHE_KEY), undefined)
})
test('same-host duplicate refresh shares one request sequence', async () => {
  const { h, s, c } = setup()
  const count = fetcher(h)
  const results = await Promise.all([s.refresh(c), s.refresh(c)])
  a.equal(count(), 4)
  a.equal(results[0].fetchedAt, results[1].fetchedAt)
})
test('invalid widget parameter makes no network request', async () => {
  const { h, s, c } = setup()
  const count = fetcher(h)
  const result = await s.refresh(c, 'systemSmall', 'https://evil')
  a.equal(count(), 0)
  a.equal(result.nodes.length, 0)
  a.match(result.notice, /UUID/)
})
test('storage failure preserves visible successful response and reports limitation', async () => {
  const { h, s, c } = setup({ failStorage: true })
  fetcher(h)
  const result = await s.refresh(c)
  a.equal(result.nodes.length, 1)
  a.match(result.notice, /缓存保存失败/)
  a.equal(h.data.get(s.CACHE_KEY), undefined)
})
test('App Intent ignores stale revision and otherwise refreshes before reloading widgets', async () => {
  const { h, c } = setup()
  const count = fetcher(h),
    intent = h.load('app_intents.tsx').RefreshKomariIntent({
      family: 'systemSmall',
      parameter: 'n1',
      revision: 'r0',
    })
  await intent.definition.perform(intent.params)
  a.equal(count(), 0)
  await intent.definition.perform({ ...intent.params, revision: c.revision })
  a.equal(count(), 5)
  a.equal(h.result.reloads, 1)
})
for (const family of ['systemSmall', 'systemMedium', 'systemLarge'])
  for (
    let count = 1;
    count <= { systemSmall: 1, systemMedium: 2, systemLarge: 4 }[family];
    count++
  )
    test(`${family}: ${count} selected nodes, native link destinations and explicit sampling footer`, async () => {
      const h = harness({
        family,
        width: family === 'systemSmall' ? 155 : 329,
        height: family === 'systemLarge' ? 345 : 155,
      })
      h.load('widget.tsx')
      await h.globals.completion
      const { WidgetView } = h.load('widget.tsx'),
        m = h.load('model.ts'),
        snapshot = m.demoSnapshot(),
        ids = snapshot.nodes.slice(0, count).map((n) => n.id),
        view = WidgetView({ snapshot, family, ids, name: 'Renamed Script' }),
        nodes = walk(view),
        texts = nodes
          .filter((n) => n.type === 'Text')
          .map((n) => n.children.join(''))
      a.equal(view.props.frame.width, h.bridge.Widget.displaySize.width)
      a.ok(view.props.widgetBackground.light)
      a.ok(view.props.widgetBackground.dark)
      for (const n of snapshot.nodes.slice(0, count))
        a.ok(texts.includes(n.name))
      a.ok(texts.some((t) => t.includes('演示') && t.includes('采样')))
      a.equal(
        nodes.filter((n) => n.type === 'Button').length,
        family === 'systemSmall' ? 0 : 1,
      )
      if (family === 'systemSmall') {
        a.match(view.props.widgetURL, /Renamed%20Script/)
        a.equal(nodes.filter((n) => n.type === 'Link').length, 0)
      } else {
        const links = nodes.filter((n) => n.type === 'Link')
        a.equal(
          links.filter((n) => n.props.url.includes('?node=')).length,
          count,
        )
        a.ok(links.some((n) => !n.props.url.includes('?node=')))
      }
      a.ok(
        !nodes.some(
          (n) =>
            n.type === 'Text' && n.children.some((c) => typeof c === 'object'),
        ),
        'Text must contain primitive children',
      )
    })
test('main entry opens all VPS and detail deep link keeps path back to fleet', async () => {
  const h = harness()
  h.load('index.tsx')
  await h.globals.completion
  a.equal(h.result.exited, true)
  a.equal(h.result.presentation, 'fullScreen')
  a.ok(
    walk(h.result.page).some(
      (n) => n.type === 'Text' && n.children.join('') === '全部节点',
    ),
  )
  const d = harness()
  d.bridge.Script.queryParameters.node = 'demo-1'
  d.load('index.tsx')
  await d.globals.completion
  a.ok(
    walk(d.result.page).some(
      (n) => n.type === 'Text' && n.children.join('').includes('全部 VPS 监控'),
    ),
  )
})
test('page polling schedules once and leaving prevents further requests', async () => {
  const { h } = setup()
  let timer,
    cleared = false
  h.globals.setTimeout = (fn) => {
    timer = fn
    return 1
  }
  h.globals.clearTimeout = (id) => {
    a.equal(id, 1)
    cleared = true
  }
  const count = fetcher(h),
    monitor = h.load('monitor.tsx').useMonitor()
  monitor.appear()
  await new Promise((resolve) => setImmediate(resolve))
  a.equal(count(), 4)
  a.equal(typeof timer, 'function')
  monitor.disappear()
  a.equal(cleared, true)
  await timer()
  a.equal(count(), 4)
})

test('fast foreground updates use 3 seconds, only fetch statuses and stop while backgrounded', async () => {
  const { h } = setup(),
    delays = []
  let timer
  h.globals.setTimeout = (fn, ms) => {
    timer = fn
    delays.push(ms)
    return 1
  }
  h.globals.clearTimeout = () => {}
  const count = fetcher(h),
    monitor = h.load('monitor.tsx').useMonitor()
  monitor.appear()
  await new Promise((resolve) => setImmediate(resolve))
  a.equal(count(), 4)
  a.equal(delays.at(-1), 3000)
  await timer()
  a.equal(count(), 5)
  h.bridge.AppEvents.scenePhase.emit('background')
  await timer()
  a.equal(count(), 5)
  h.bridge.AppEvents.scenePhase.emit('active')
  await new Promise((resolve) => setImmediate(resolve))
  a.equal(count(), 6)
  monitor.disappear()
  a.equal(h.bridge.AppEvents.scenePhase.listeners.size, 0)
})
test('automatic retry backs off during failure and recovers its interval after success', async () => {
  const { h } = setup(),
    delays = []
  let timer
  h.globals.setTimeout = (fn, ms) => {
    timer = fn
    delays.push(ms)
    return 1
  }
  h.globals.clearTimeout = () => {}
  fetcher(h, { fail: true })
  const monitor = h.load('monitor.tsx').useMonitor()
  monitor.appear()
  await new Promise((resolve) => setImmediate(resolve))
  a.equal(delays.at(-1), 6000)
  await timer()
  a.equal(delays.at(-1), 12000)
  fetcher(h)
  await timer()
  a.equal(delays.at(-1), 3000)
  monitor.disappear()
})
test('site title, cached favicon and compact traffic/probe readings appear in each widget', async () => {
  for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
    const h = harness({ family }),
      m = h.load('model.ts'),
      snapshot = m.demoSnapshot()
    snapshot.site = { title: '星海监控', icon: 'fixture-image' }
    h.globals.UIImage.fromBase64String = (value) =>
      value === 'fixture-image' ? { decoded: true } : null
    h.load('widget.tsx')
    await h.globals.completion
    const view = h
      .load('widget.tsx')
      .WidgetView({ snapshot, family, ids: ['demo-1'] })
    const tree = walk(view),
      labels = tree
        .filter((n) => n.type === 'Text')
        .map((n) => n.children.join(''))
        .join('|')
    a.match(labels, /星海监控/)
    a.match(labels, /流量/)
    a.match(labels, /延迟/)
    a.match(labels, /丢包/)
    a.ok(tree.some((n) => n.type === 'Image' && n.props.image?.decoded))
  }
})
test('all widget layouts and panel cards display the same task-averaged probe readings', async () => {
  for (const [family, count] of [
    ['systemSmall', 1],
    ['systemMedium', 1],
    ['systemMedium', 2],
    ['systemLarge', 1],
    ['systemLarge', 2],
    ['systemLarge', 3],
    ['systemLarge', 4],
  ]) {
    const { h, m } = setup({ family }),
      snapshot = m.demoSnapshot()
    for (const n of snapshot.nodes)
      n.status.ping = [
        { name: 'A', latest: 900, avg: 20, loss: 10 },
        { name: 'B', latest: 800, avg: 60, loss: 30 },
      ]
    h.load('widget.tsx')
    await h.globals.completion
    const widget = h.load('widget.tsx').WidgetView({
      snapshot,
      family,
      ids: snapshot.nodes.slice(0, count).map((n) => n.id),
    })
    const labels = walk(widget)
      .filter((n) => n.type === 'Text')
      .map((n) => n.children.join(''))
    a.equal(labels.filter((s) => s === '延迟 40 ms').length, count)
    a.equal(labels.filter((s) => s === '丢包 20%').length, count)
    a.ok(!labels.some((s) => /延迟 (20|60|800|900) ms/.test(s)))
    for (const dense of [false, true]) {
      const card = h.load('ui.tsx').NodeCard({ node: snapshot.nodes[0], dense })
      const cardLabels = walk(card)
        .filter((n) => n.type === 'Text')
        .map((n) => n.children.join(''))
      a.ok(cardLabels.includes('延迟 40 ms'))
      a.ok(cardLabels.includes('丢包 20%'))
    }
    h.load('monitor.tsx').useMonitor = () => ({
      snapshot,
      config: m.defaultConfig(),
      busy: false,
      liveNote: '演示数据',
      error: '',
      reload: async () => {},
      appear() {},
      disappear() {},
    })
    const detail = h.load('detail.tsx').Detail({ id: snapshot.nodes[0].id })
    const detailLabels = walk(detail)
      .filter((n) => n.type === 'Text')
      .map((n) => n.children.join(''))
    a.ok(detailLabels.includes('延迟 40 ms'))
    a.ok(detailLabels.includes('丢包 20%'))
    a.ok(detailLabels.some((s) => s.includes('2 项探测均值')))
  }
})

test('favicon decoding is cached, never receives Authorization and is not fetched every status tick', async () => {
  const { h, s, c } = setup(),
    calls = []
  fetcher(h)
  const original = h.bridge.fetch
  h.globals.UIImage.fromData = () => ({
    preparingThumbnail: () => ({ toPNGBase64String: () => 'encoded-fixture' }),
  })
  h.bridge.fetch = async (url, init) => {
    calls.push({ url, init })
    if (url.endsWith('/favicon.ico'))
      return {
        ok: true,
        expectedContentLength: 20,
        data: async () => ({ size: 20 }),
      }
    return original(url, init)
  }
  const first = await s.refresh(c)
  a.equal(first.site.title, '星海监控')
  a.equal(first.site.icon, 'encoded-fixture')
  a.equal(
    calls.find((x) => x.url.endsWith('/favicon.ico')).init.headers,
    undefined,
  )
  await s.refresh(c, undefined, '', true)
  await s.refresh(c)
  a.equal(calls.filter((x) => x.url.endsWith('/favicon.ico')).length, 1)
  a.equal(s.readCache(c).site.icon, 'encoded-fixture')
})

test('rerendered page removes the original scene listener rather than its new closure', async () => {
  const { h } = setup()
  h.globals.setTimeout = () => 1
  h.globals.clearTimeout = () => {}
  let retained
  h.bridge.useState = (initial) => {
    let value = typeof initial === 'function' ? initial() : initial
    if (value && typeof value === 'object' && 'visible' in value) {
      if (!retained) retained = value
      value = retained
    }
    return [value, () => {}]
  }
  fetcher(h)
  const useMonitor = h.load('monitor.tsx').useMonitor,
    first = useMonitor()
  first.appear()
  await new Promise((resolve) => setImmediate(resolve))
  const rerender = useMonitor()
  rerender.disappear()
  a.equal(h.bridge.AppEvents.scenePhase.listeners.size, 0)
})

test('upgrading retries a legacy failed favicon cache and decodes a 218 KB PNG served as ico', async () => {
  const { h, s, c } = setup()
  fetcher(h)
  await s.refresh(c)
  const saved = h.data.get(s.CACHE_KEY)
  saved.snapshot.site = {
    title: '星海监控',
    iconCheckedAt: new Date().toISOString(),
  }
  const original = h.bridge.fetch
  let decoded = 0,
    requests = 0
  h.globals.UIImage.fromData = (data) => {
    a.equal(data.size, 222845)
    decoded++
    return {
      preparingThumbnail: () => ({ toPNGBase64String: () => 'thumbnail' }),
    }
  }
  h.bridge.fetch = async (url, init) => {
    if (!url.endsWith('/favicon.ico')) return original(url, init)
    requests++
    return {
      ok: true,
      expectedContentLength: 222845,
      data: async () => ({ size: 222845 }),
    }
  }
  const fresh = await s.refresh(c)
  a.equal(fresh.site.icon, 'thumbnail')
  a.equal(fresh.site.iconVersion, 2)
  a.equal(decoded, 1)
  await s.refresh(c)
  a.equal(requests, 1)
})

test('missing favicon retries after five minutes and a decode failure preserves a working icon', async () => {
  const { h, s, c } = setup()
  fetcher(h)
  await s.refresh(c)
  const original = h.bridge.fetch
  let requests = 0
  h.bridge.fetch = async (url, init) => {
    if (!url.endsWith('/favicon.ico')) return original(url, init)
    requests++
    return {
      ok: true,
      expectedContentLength: 20,
      data: async () => ({ size: 20 }),
    }
  }
  await s.refresh(c)
  a.equal(requests, 0)
  h.data.get(s.CACHE_KEY).snapshot.site.iconCheckedAt = new Date(
    Date.now() - 6 * 60_000,
  ).toISOString()
  await s.refresh(c)
  a.equal(requests, 1)
  const site = h.data.get(s.CACHE_KEY).snapshot.site
  site.icon = 'working-icon'
  site.iconCheckedAt = new Date(Date.now() - 7 * 3600_000).toISOString()
  const fresh = await s.refresh(c)
  a.equal(requests, 2)
  a.equal(fresh.site.icon, 'working-icon')
})

test('limited and unlimited traffic retain the same meter rows in a two-node medium widget', async () => {
  const h = harness({ family: 'systemMedium', width: 329, height: 155 })
  h.load('widget.tsx')
  await h.globals.completion
  const snapshot = h.load('model.ts').demoSnapshot()
  snapshot.nodes[0].trafficLimit = null
  snapshot.nodes[1].trafficLimit = 1024 ** 4
  const view = h
    .load('widget.tsx')
    .WidgetView({
      snapshot,
      family: 'systemMedium',
      ids: snapshot.nodes.slice(0, 2).map((n) => n.id),
    })
  const links = walk(view).filter(
    (n) => n.type === 'Link' && n.props.url.includes('?node='),
  )
  const meters = links.map((link) =>
    walk(link).find(
      (n) =>
        n.type === 'VStack' &&
        n.children.some((c) => c.type === 'ProgressView'),
    ),
  )
  a.ok(meters.every(Boolean))
  a.deepEqual(
    meters[0].children.map((n) => n.type),
    meters[1].children.map((n) => n.type),
  )
  a.equal(
    meters[0].children.find((n) => n.type === 'ProgressView').props.value,
    0,
  )
  const labels = walk(meters[0])
    .filter((n) => n.type === 'Text')
    .map((n) => n.children.join(''))
    .join('|')
  a.match(labels, /0\.0%/)
  a.match(labels, /\/ ∞/)
})
