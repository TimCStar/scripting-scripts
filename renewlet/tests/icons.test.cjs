const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, walk } = require('../tools/harness.cjs')
const c = {
  baseURL: 'https://example.test/sub',
  mode: 'session',
  revision: 'a',
  days: 30,
  zone: 'Asia/Shanghai',
}
const auth = {
  mode: 'session',
  session: 'session-test',
  expiresAt: '2099-01-01T00:00:00Z',
}
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#456" d="M0 0h24v24H0z"/></svg>'
function data(text, raster = false, size = Buffer.byteLength(text)) {
  return {
    size,
    raster,
    toRawString: () => text,
    toBase64String: () => Buffer.from(text).toString('base64'),
    slice: (a, b) => data(text.slice(a, b)),
  }
}
function response(text = svg, mimeType = 'image/svg+xml') {
  return {
    ok: true,
    mimeType,
    data: async () => data(text, mimeType === 'image/png'),
  }
}
function sub(h, logo, id = 's') {
  return {
    ...h.load('model.ts').newSubscription('2026-10-01'),
    id,
    name: 'Test',
    logo,
  }
}

test('logo wire field survives parsing; invalid schemes, userinfo and asset paths are discarded', () => {
  const h = harness(),
    m = h.load('model.ts'),
    s = sub(h, '/api/app/assets/a_b-123')
  assert.equal(m.parseSubscription(s).logo, s.logo)
  for (const logo of [
    'data:image/png;base64,a',
    'javascript:alert(1)',
    '//else.test/a',
    '/api/app/assets/../x',
    'https://user:pass@example.test/a',
  ])
    assert.equal(m.parseSubscription({ ...s, logo }).logo, undefined)
  assert.equal(
    m.parseSubscription({ ...s, logo: 'https://cdn.test/icon.svg' }).logo,
    'https://cdn.test/icon.svg',
  )
})

test('private asset routing respects subpath and session expiry; external URLs receive no credential headers', () => {
  const h = harness(),
    icons = h.load('icons.ts')
  const request = icons.logoRequest(c, '/api/app/assets/a', auth)
  assert.equal(request.url, 'https://example.test/sub/api/app/assets/a')
  assert.equal(request.headers.Cookie, 'renewlet_session=session-test')
  assert.equal(
    icons.logoRequest({ ...c, mode: 'public' }, '/api/app/assets/a', {
      mode: 'public',
      token: 'test',
    }),
    null,
  )
  assert.equal(
    icons.logoRequest(c, '/api/app/assets/a', {
      ...auth,
      expiresAt: '2020-01-01',
    }),
    null,
  )
  assert.equal(
    Object.keys(icons.logoRequest(c, 'https://cdn.test/logo.png', auth).headers)
      .length,
    0,
  )
})

test('SVG is prefetched, cached, reused offline and scoped to the connection; actual icon appears in a row', async () => {
  let requests = 0
  const h = harness({
      config: c,
      fetcher: async (url, init) => {
        requests++
        assert.equal(init.headers.Cookie, 'renewlet_session=session-test')
        assert.equal(
          await init.handleRedirect({ url: 'https://other.test' }),
          null,
        )
        return response()
      },
    }),
    icons = h.load('icons.ts'),
    s = sub(h, '/api/app/assets/a')
  await icons.prepareLogos(c, [s, s], auth)
  assert.equal(requests, 1)
  assert.equal(icons.readLogo(c, s).svg, svg)
  await icons.prepareLogos(c, [s], auth)
  assert.equal(requests, 1)
  assert.equal(icons.readLogo({ ...c, revision: 'b' }, s), null)
  assert.equal(
    walk(h.load('ui.tsx').SubscriptionRow({ s, date: '2026-10-01' })).some(
      (n) => n.type === 'SVG',
    ),
    true,
  )
  const offline = harness({ config: c })
  for (const [k, v] of h.data) offline.data.set(k, v)
  assert.equal(offline.load('icons.ts').readLogo(c, s).svg, svg)
  assert.equal(JSON.stringify([...h.data]).includes('session-test'), false)
})

test('raster decoding produces a cached thumbnail; unknown extension is identified from the response', async () => {
  const h = harness({
      config: c,
      fetcher: async () => response('raster', 'image/png'),
    }),
    icons = h.load('icons.ts'),
    s = sub(h, 'https://cdn.test/opaque')
  await icons.prepareLogos(c, [s], auth)
  assert.ok(icons.readLogo(c, s).image)
  assert.equal(
    walk(h.load('ui.tsx').SubscriptionRow({ s, date: '2026-10-01' })).some(
      (n) => n.type === 'Image' && n.props.image,
    ),
    true,
  )
  assert.ok([...h.data.keys()].some((k) => k.endsWith('.data')))
})

test('failed, oversized and unsafe logo responses leave a usable initial fallback', async () => {
  for (const fetcher of [
    async () => {
      throw Error('offline')
    },
    async () => ({ ...response(), expectedContentLength: 3 * 1024 * 1024 }),
    async () => ({
      ...response(),
      data: async () => data(svg, false, 3 * 1024 * 1024),
    }),
    async () => response('<svg><script>alert(1)</script></svg>'),
    async () => response('<svg><image href="https://other.test"/></svg>'),
    async () => response('not an image', 'application/octet-stream'),
  ]) {
    const h = harness({ config: c, fetcher }),
      icons = h.load('icons.ts'),
      s = sub(h, 'https://cdn.test/icon')
    await icons.prepareLogos(c, [s], auth)
    assert.equal(icons.readLogo(c, s), null)
    assert.ok(
      walk(h.load('ui.tsx').SubscriptionRow({ s, date: '2026-10-01' })).some(
        (n) => n.type === 'Text' && n.children.join('') === 'T',
      ),
    )
  }
})

test('SVG accepts internal gradients and rejects active content, encoded or external references', () => {
  const i = harness().load('icons.ts')
  assert.ok(
    i.safeSVG(
      '<svg><defs><linearGradient id="g"/></defs><path fill="url(#g)"/></svg>',
    ),
  )
  for (const value of [
    '<svg onload="alert(1)"/>',
    '<svg><use href="https://other.test/a"/></svg>',
    '<svg><path style="fill:url(https://other.test/a)"/></svg>',
    '<svg><use href="&#104;ttps://other.test/a"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "https://other.test">]><svg/>',
    '<?xml-stylesheet href="https://other.test/a"?><svg/>',
    '<svg><foreignObject/></svg>',
    '<svg><style>@import "https://other.test";</style></svg>',
  ])
    assert.equal(i.safeSVG(value), null, value)
})

test('disconnect while an image is in flight cannot repopulate private caches; cache is bounded', async () => {
  let release
  const h = harness({
      config: c,
      fetcher: () =>
        new Promise((resolve) => {
          release = () => resolve(response())
        }),
    }),
    icons = h.load('icons.ts'),
    s = sub(h, '/api/app/assets/a')
  const pending = icons.prepareLogos(c, [s], auth)
  icons.clearLogos()
  release()
  await pending
  assert.equal(icons.readLogo(c, s), null)
  assert.equal(
    [...h.data.keys()].some((k) => k.startsWith('renewlet.logo.')),
    false,
  )
  h.bridge.fetch = async () => response()
  await icons.prepareLogos(
    c,
    Array.from({ length: 90 }, (_, n) => sub(h, 'https://cdn.test/' + n)),
    auth,
  )
  assert.equal(h.data.get('renewlet.logo.v1.index').length, 80)
  icons.clearLogos()
  assert.equal(
    [...h.data.keys()].some((k) => k.startsWith('renewlet.logo.')),
    false,
  )
})

test('loading logos in the background does not hold the list refresh lock', async () => {
  let release
  const h = harness({
    config: c,
    fetcher: async (url) => {
      if (url.startsWith('https://cdn.test'))
        return new Promise((resolve) => {
          release = () => resolve(response())
        })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            subscriptions: [sub(h, 'https://cdn.test/a')],
            nextCursor: null,
          },
        }),
      }
    },
  })
  const state = h.load('state.ts')
  state.saveConnection(c, { ...auth, csrf: 'csrf-test' })
  const app = h.load('index.tsx')
  await h.globals.completion
  const page = h.renderComponent(app.Dashboard)
  page.render().props.onAppear()
  await new Promise((resolve) => setImmediate(resolve))
  const gate = page.slots.find(
    (v) => v && typeof v === 'object' && 'serial' in v,
  )
  assert.equal(gate.busy, false)
  assert.ok(release)
  release()
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(h.load('icons.ts').readLogo(c, sub(h, 'https://cdn.test/a')))
})
