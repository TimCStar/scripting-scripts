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
    icons.logoRequest(c, 'https://example.test/sub/api/app/assets/a', auth)
      .headers.Cookie,
    'renewlet_session=session-test',
  )
  assert.equal(
    Object.keys(
      icons.logoRequest(
        c,
        'https://example.test.evil/sub/api/app/assets/a',
        auth,
      ).headers,
    ).length,
    0,
  )
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

test('anonymous image redirects remove cookies, block unsafe targets and have a bounded hop count', async () => {
  const h = harness({
    config: c,
    fetcher: async (_, init) => {
      const redirect = {
        url: 'https://cdn.test/final.svg',
        headers: { Cookie: 'secret' },
        cookies: [{ name: 'test', value: 'secret' }],
      }
      const next = await init.handleRedirect(redirect)
      assert.equal(Object.keys(next.headers).length, 0)
      assert.equal(next.cookies.length, 0)
      assert.equal(
        await init.handleRedirect({ url: 'file:///private/a' }),
        null,
      )
      assert.equal(
        await init.handleRedirect({ url: 'http://cdn.test/a' }),
        null,
      )
      await init.handleRedirect(redirect)
      assert.equal(await init.handleRedirect(redirect), null)
      return response()
    },
  })
  await h.load('icons.ts').prepareLogos(c, [sub(h, 'https://cdn.test/a')], auth)
  assert.ok(h.load('icons.ts').readLogo(c, sub(h, 'https://cdn.test/a')))
})

test('static SVG export styles become attributes, white artwork gets a dark plate, ChatGPT works offline', () => {
  const h = harness({ config: c }),
    i = h.load('icons.ts')
  const normalized = i.safeSVG(
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "https://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg viewBox="0 0 24 24"><style>/*export*/.a{fill:white}.b{fill:#fff}</style><path class="a b" fill="black" style="opacity:0.8" d="M0 0h24v24H0z"/></svg>',
  )
  assert.ok(normalized)
  assert.doesNotMatch(normalized, /style|DOCTYPE/)
  assert.equal((normalized.match(/fill=/g) || []).length, 1)
  assert.equal(i.logoBackground({ svg: normalized }), '#293147')
  assert.equal(
    i.safeSVG('<svg><style>.a{fill:url(https://other.test/a)}</style></svg>'),
    null,
  )
  assert.ok(
    i.readLogo(c, { ...sub(h, 'https://blocked.test/a'), name: 'Chatgpt Team' })
      .svg,
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

test('gradient CSS and dashed strokes from real upstream exports survive normalization without allowing external effects', () => {
  const i = harness().load('icons.ts')
  const result = i.safeSVG(
    '<svg viewBox="0 0 24 24"><style>.start{stop-color:#3e82f4;stop-opacity:1}.line{stroke-dasharray:2 3;stroke-dashoffset:1}</style><defs><linearGradient id="g"><stop class="start"/><stop offset="1" style="stop-color:#93dcf7;stop-opacity:0"/></linearGradient></defs><path class="line" style="fill:url(#g);stroke-width:0" d="M0 0h24v24H0z"/></svg>',
  )
  assert.ok(result)
  assert.match(result, /stop-color="#3e82f4"/)
  assert.match(result, /stop-opacity="0"/)
  assert.match(result, /stroke-dasharray="2 3"/)
  assert.match(result, /fill="url\(#g\)"/)
  assert.doesNotMatch(result, /style[=>]/)
  for (const style of [
    'filter:url(https://evil.test/f)',
    'mask:url(//evil.test/m)',
    'clip-path:url(data:image/svg+xml,a)',
  ]) {
    assert.equal(i.safeSVG(`<svg><path style="${style}"/></svg>`), null)
  }
})

test('diagnostics distinguish HTTP, HTML, SVG, decoding and transport failures without revealing URLs or response text', async () => {
  const cases = [
    [async () => ({ ok: false, status: 403 }), /HTTP 403/],
    [
      async () => response('<html>private response</html>', 'text/html'),
      /返回了网页/,
    ],
    [async () => response('<svg><script>secret</script></svg>'), /SVG/],
    [async () => response('unrecognized', 'image/x-icon'), /无法解码/],
    [
      async () => {
        throw Error('https://secret.test/?token=secret')
      },
      /网络、TLS 或超时/,
    ],
    [
      async () => ({ ...response(), expectedContentLength: 3 * 1024 * 1024 }),
      /超过/,
    ],
  ]
  for (const [fetcher, expected] of cases) {
    const h = harness({ config: c, fetcher }),
      i = h.load('icons.ts')
    const reports = await i.prepareLogos(
      c,
      [sub(h, 'https://cdn.test/icon?token=secret')],
      auth,
      true,
    )
    assert.equal(reports[0].ok, false)
    assert.equal(reports[0].source, 'cdn.test')
    assert.match(reports[0].message, expected)
    assert.doesNotMatch(
      JSON.stringify(reports),
      /secret|private response|session-test/,
    )
  }
  const h = harness({ config: c }),
    i = h.load('icons.ts')
  assert.match(
    (await i.prepareLogos(c, [sub(h, '/api/app/assets/a')], null, true))[0]
      .message,
    /有效登录会话/,
  )
  assert.match(
    (await i.prepareLogos(c, [sub(h, undefined)], auth, true))[0].message,
    /未配置/,
  )
})

test('explicit retry bypasses fresh caches, deduplicates URLs, increases timeout and preserves working icons after failure', async () => {
  let requests = 0,
    fail = false
  const h = harness({
    config: c,
    fetcher: async (_, init) => {
      requests++
      assert.equal(init.timeout, requests === 1 ? 5 : 15)
      if (fail) throw Error('offline')
      return response()
    },
  })
  const i = h.load('icons.ts'),
    s = sub(h, 'https://cdn.test/a')
  await i.prepareLogos(c, [s], auth)
  fail = true
  const reports = await i.prepareLogos(c, [s, { ...s, id: 'two' }], auth, true)
  assert.equal(requests, 2)
  assert.equal(reports.length, 2)
  assert.ok(reports.every((r) => !r.ok && r.retained))
  assert.equal(i.readLogo(c, s).svg, svg)
})

test('retry waiting for an old in-flight request cannot restart it after disconnect', async () => {
  let release,
    requests = 0
  const h = harness({
    config: c,
    fetcher: () => {
      requests++
      return new Promise((resolve) => {
        release = () => resolve(response())
      })
    },
  })
  const i = h.load('icons.ts'),
    s = sub(h, '/api/app/assets/a')
  const background = i.prepareLogos(c, [s], auth)
  const retry = i.prepareLogos(c, [s], auth, true)
  i.clearLogos()
  release()
  await Promise.all([background, retry])
  assert.equal(requests, 1)
  assert.equal(i.readLogo(c, s), null)
  assert.equal(
    [...h.data.keys()].some((k) => k.startsWith('renewlet.logo.')),
    false,
  )
})

test('diagnostics page retries cached subscriptions and requests widget reload with per-subscription results', async () => {
  const h = harness({
    config: c,
    fetcher: async (url, init) => {
      if (url.startsWith('https://cdn.test')) {
        assert.equal(init.timeout, 15)
        assert.equal(Object.keys(init.headers).length, 0)
        return response()
      }
      throw Error('offline list')
    },
  })
  h.load('state.ts').saveConnection(c, auth)
  h.data.set('renewlet.snapshot.v1', {
    revision: c.revision,
    fetchedAt: '2026-10-01T00:00:00Z',
    subscriptions: [sub(h, 'https://cdn.test/a?token=private-query')],
  })
  const page = h.renderComponent(h.load('icon-diagnostics.tsx').IconDiagnostics)
  await walk(page.render())
    .find((n) => n.type === 'Button')
    .props.action()
  const content = walk(page.render())
    .filter((n) => n.type === 'Text')
    .map((n) => n.children.join(''))
    .join('\n')
  assert.match(content, /SVG 已下载并通过检查/)
  assert.match(content, /使用上次订阅快照/)
  assert.match(content, /cdn.test/)
  assert.doesNotMatch(content, /private-query|session-test/)
  assert.equal(h.result.reloads, 2)
})
