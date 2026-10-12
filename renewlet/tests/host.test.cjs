const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { harness, walk } = require('../tools/harness.cjs')
test('sort choice persists; failed persistence does not claim success', () => {
  const h = harness(),
    s = h.load('state.ts')
  s.saveSort('updated')
  assert.equal(s.readSort(), 'updated')
  h.data.set('renewlet.sort.v1', 'unknown')
  assert.equal(s.readSort(), 'due')
  assert.throws(() =>
    harness({ failStorage: true }).load('state.ts').saveSort('name'),
  )
})
test('demo edits and additions persist separately from real account; reset is isolated', async () => {
  const h = harness(),
    m = h.load('model.ts'),
    s = h.load('state.ts'),
    c = s.readConfig(),
    before = s.initial(c).subscriptions[0]
  await s.save(c, before, { ...before, name: 'Edited' })
  assert.equal(s.initial(c).subscriptions[0].name, 'Edited')
  await s.save(c, null, {
    ...m.newSubscription(m.today(c.zone)),
    name: 'Added',
  })
  assert.equal(s.initial(c).subscriptions.length, 7)
  s.resetDemo()
  assert.equal(s.initial(c).subscriptions.length, 6)
})
test('cache belongs to connection revision; network failure keeps original success time', async () => {
  const c = {
      baseURL: 'https://example.test',
      mode: 'public',
      days: 30,
      zone: 'Asia/Shanghai',
      revision: 'a',
    },
    h = harness({ config: c }),
    s = h.load('state.ts'),
    m = h.load('model.ts'),
    snap = m.demoSnapshot(c.zone)
  h.data.set('renewlet.snapshot.v1', { ...snap, revision: 'a' })
  let result = await s.refresh(c)
  assert.equal(result.cached, true)
  assert.equal(result.fetchedAt, snap.fetchedAt)
  h.data.set('renewlet.config.v1', { ...c, revision: 'b' })
  assert.equal(s.initial().subscriptions.length, 0)
})
test('credentials are bound to exact baseURL and mode, stored only in Keychain', () => {
  const h = harness(),
    s = h.load('state.ts'),
    c = {
      baseURL: 'https://example.test/sub',
      mode: 'public',
      days: 30,
      zone: 'Asia/Shanghai',
      revision: 'a',
    }
  s.saveConnection(c, { mode: 'public', token: 'sensitive-test' })
  assert.equal(s.credential(c).token, 'sensitive-test')
  assert.equal(s.credential({ ...c, baseURL: 'https://other.test' }), null)
  assert.equal(JSON.stringify([...h.data]).includes('sensitive-test'), false)
})
test('all widget families execute, small has home URL, medium/large have detail and home links', async () => {
  for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
    const h = harness({ family }),
      c = h.load('state.ts').readConfig()
    h.load('widget.tsx')
    await h.globals.completion
    const nodes = walk(h.result.view)
    assert.equal(h.result.policy.policy, 'after')
    assert.equal(
      nodes.some(
        (n) => n.type === 'Text' && n.children.join('').includes('演示'),
      ),
      true,
    )
    if (family === 'systemSmall') {
      assert.match(h.result.view.props.widgetURL, /scripting/)
      assert.equal(nodes.filter((n) => n.type === 'Link').length, 0)
    } else {
      assert.equal(
        nodes.some(
          (n) => n.type === 'Link' && n.props.url.includes('?subscription='),
        ),
        true,
      )
      assert.equal(
        nodes.some(
          (n) => n.type === 'Link' && !n.props.url.includes('?subscription='),
        ),
        true,
      )
    }
    assert.equal(c.mode, 'demo')
  }
})

test('a stalled Home Screen request presents the saved snapshot after the deadline without hooks or image requests', async () => {
  const config = {
    baseURL: 'https://example.test',
    mode: 'session',
    revision: 'widget',
    days: 30,
    zone: 'Asia/Shanghai',
  }
  const requests = []
  const h = harness({
    config,
    fetcher: (url) => {
      requests.push(url)
      return new Promise(() => {})
    },
  })
  const state = h.load('state.ts')
  state.saveConnection(config, {
    mode: 'session',
    session: 's',
    csrf: 'c',
    expiresAt: '2099-01-01',
  })
  const snapshot = h.load('model.ts').demoSnapshot(config.zone)
  snapshot.subscriptions[0].logo = 'https://slow-image.test/icon.png'
  h.data.set('renewlet.snapshot.v1', { ...snapshot, revision: config.revision })
  let deadline,
    cleared = false
  h.globals.setTimeout = (fn, ms) => {
    assert.equal(ms, 8000)
    deadline = fn
    return 7
  }
  h.globals.clearTimeout = (id) => {
    assert.equal(id, 7)
    cleared = true
  }
  h.bridge.useState = () => {
    throw Error('Widgets must render without state hooks')
  }
  h.load('widget.tsx')
  assert.equal(h.result.view, undefined)
  deadline()
  await h.globals.completion
  assert.ok(h.result.view)
  assert.equal(cleared, true)
  assert.equal(requests.length, 1)
  assert.match(requests[0], /\/api\/app\/subscriptions/)
  assert.ok(
    walk(h.result.view).some(
      (n) => n.type === 'Text' && n.children.join('').includes('旧快照'),
    ),
  )
  assert.equal(
    walk(h.result.view).some((n) => typeof n.props.onAppear === 'function'),
    false,
  )
})

test('a successful widget sync clears its deadline and does not fetch optional display services', async () => {
  const config = {
    baseURL: 'https://example.test',
    mode: 'session',
    revision: 'widget',
    days: 30,
    zone: 'Asia/Shanghai',
  }
  const requests = []
  const h = harness({
    config,
    fetcher: async (url) => {
      requests.push(url)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: { subscriptions: [], nextCursor: null },
        }),
      }
    },
  })
  h.load('state.ts').saveConnection(config, {
    mode: 'session',
    session: 's',
    csrf: 'c',
    expiresAt: '2099-01-01',
  })
  let cleared = false
  h.globals.setTimeout = () => 9
  h.globals.clearTimeout = (id) => {
    assert.equal(id, 9)
    cleared = true
  }
  h.load('widget.tsx')
  await h.globals.completion
  assert.ok(h.result.view)
  assert.equal(requests.length, 1)
  assert.equal(cleared, true)
  assert.equal(
    walk(h.result.view).some(
      (n) => n.type === 'Text' && n.children.join('').includes('旧快照'),
    ),
    false,
  )
})
test('app presents entire subscription list and exits after dismissal; all page modules load', async () => {
  const h = harness()
  h.load('index.tsx')
  await h.globals.completion
  assert.equal(h.result.exited, true)
  assert.equal(
    walk(h.result.page).filter((n) => n.type === 'NavigationLink').length,
    6,
  )
  h.load('editor.tsx')
  h.load('settings.tsx')
  h.load('detail.tsx')
})
test('real edit detects concurrent changes and does not send PATCH', async () => {
  const c = {
    baseURL: 'https://example.test',
    mode: 'session',
    days: 30,
    zone: 'Asia/Shanghai',
    revision: 'a',
  }
  let writes = 0,
    before
  const h = harness({
      config: c,
      fetcher: async (url, init) => {
        if (init.method !== 'GET') writes++
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              subscription: {
                ...before,
                name: 'Changed remotely',
                updatedAt: '2026-10-10T01:00:00Z',
              },
            },
          }),
        }
      },
    }),
    s = h.load('state.ts'),
    m = h.load('model.ts')
  s.saveConnection(c, {
    mode: 'session',
    session: 's',
    csrf: 'c',
    expiresAt: '2099-01-01T00:00:00Z',
  })
  before = {
    ...m.newSubscription('2026-10-01'),
    id: 'a',
    name: 'Before',
    updatedAt: '2026-10-09T01:00:00Z',
  }
  await assert.rejects(
    () => s.save(c, before, { ...before, price: '2' }),
    /其他设备/,
  )
  assert.equal(writes, 0)
})
test('pending list cannot overwrite a confirmed edit, offline reload retains the other subscriptions', async () => {
  const c = {
    baseURL: 'https://example.test',
    mode: 'session',
    days: 30,
    zone: 'Asia/Shanghai',
    revision: 'a',
  }
  let release,
    before,
    networkFailed = false
  const h = harness({
      config: c,
      fetcher: async (url, init) => {
        if (networkFailed) throw Error('offline')
        if (url.includes('?'))
          return new Promise((resolve) => {
            release = () =>
              resolve({
                ok: true,
                status: 200,
                json: async () => ({
                  ok: true,
                  data: { subscriptions: [before], nextCursor: null },
                }),
              })
          })
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              subscription:
                init.method === 'PATCH' ? { ...before, price: '2' } : before,
            },
          }),
        }
      },
    }),
    s = h.load('state.ts'),
    m = h.load('model.ts')
  s.saveConnection(c, {
    mode: 'session',
    session: 's',
    csrf: 'c',
    expiresAt: '2099-01-01T00:00:00Z',
  })
  before = { ...m.newSubscription('2026-10-01'), id: 'a', name: 'Before' }
  h.data.set('renewlet.snapshot.v1', {
    revision: 'a',
    fetchedAt: '2026-10-10T00:00:00Z',
    subscriptions: [before, { ...before, id: 'b', name: 'Other' }],
  })
  const pending = s.refresh(c)
  await s.save(c, before, { ...before, price: '2' })
  release()
  await pending
  networkFailed = true
  const snapshot = await s.refresh(c)
  assert.equal(snapshot.cached, true)
  assert.equal(snapshot.subscriptions.length, 2)
  assert.equal(snapshot.subscriptions[0].price, '2')
  assert.equal(snapshot.fetchedAt, '2026-10-10T00:00:00Z')
})
test('leaving during a request then reappearing renders the latest state without a stuck refresh lock', async () => {
  const h = harness(),
    module = h.load('index.tsx')
  await h.globals.completion
  const page = h.renderComponent(module.Dashboard),
    view = page.render(),
    appear = view.props.onAppear,
    disappear = view.props.onDisappear
  appear()
  disappear()
  appear()
  await new Promise((resolve) => setImmediate(resolve))
  const gate = page.slots.find(
    (v) => v && typeof v === 'object' && 'serial' in v && 'active' in v,
  )
  assert.equal(gate.active, true)
  assert.equal(gate.busy, false)
  assert.equal(
    page.slots.some(
      (v) => v && typeof v === 'object' && v.subscriptions?.length === 6,
    ),
    true,
  )
})
test('editor allows typing comma-separated tags and negative reminder sentinels without erasing partial input', async () => {
  const h = harness(),
    m = h.load('model.ts'),
    c = h.load('state.ts').readConfig()
  let saved
  const before = {
    ...m.newSubscription(m.today(c.zone)),
    id: 'demo-edit',
    name: 'Editor test',
  }
  h.data.set('renewlet.demo.v1', {
    subscriptions: [before],
    fetchedAt: new Date().toISOString(),
  })
  const page = h.renderComponent(h.load('editor.tsx').Editor, {
    config: c,
    before,
    onSaved: (s) => {
      saved = s
    },
  })
  const field = (title) =>
    walk(page.render()).find(
      (n) => n.type === 'TextField' && n.props.title === title,
    )
  field('标签').props.onChanged('one,')
  assert.equal(field('标签').props.value, 'one,')
  field('标签').props.onChanged('one, two')
  field('提前提醒天数').props.onChanged('-')
  assert.equal(field('提前提醒天数').props.value, '-')
  field('提前提醒天数').props.onChanged('-2')
  await page.render().props.toolbar.confirmationAction.props.action()
  assert.equal(saved.tags.join('|'), 'one|two')
  assert.equal(saved.reminderDays, -2)
})
