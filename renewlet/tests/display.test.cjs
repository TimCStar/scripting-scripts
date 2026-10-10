const { test } = require('node:test'),
  assert = require('node:assert/strict')
const { harness, walk } = require('../tools/harness.cjs')
const c = {
  baseURL: 'https://example.test',
  mode: 'session',
  revision: 'a',
  days: 30,
  zone: 'Asia/Shanghai',
}
const auth = {
  mode: 'session',
  session: 'test',
  csrf: 'test',
  expiresAt: '2099-01-01',
}
const rates = {
  date: '2026-10-09',
  usd: { usd: 1, cny: 7, gbp: 0.75, try: 40 },
}
test('Chinese categories preserve raw values, custom Chinese labels and unknown categories in the editor', () => {
  const h = harness({ config: c }),
    p = h.load('presentation.ts'),
    m = h.load('model.ts')
  assert.equal(p.categoryLabel('cloud_storage'), '云存储')
  assert.equal(p.categoryLabel('ai_tools'), 'AI 工具')
  assert.equal(p.categoryLabel('my_category'), 'my_category')
  h.data.set('renewlet.categories.v1', {
    revision: 'a',
    values: [{ value: 'my_category', labels: { 'zh-CN': '网络服务' } }],
  })
  const before = {
    ...m.newSubscription('2026-10-01'),
    category: 'my_category',
    name: 'Example',
  }
  const page = h.renderComponent(h.load('editor.tsx').Editor, {
    config: c,
    before,
  })
  const picker = () =>
    walk(page.render()).find(
      (n) => n.type === 'Picker' && n.props.title === '分类',
    )
  assert.equal(picker().props.value, 'my_category')
  assert.equal(
    walk(picker())
      .find((n) => n.props.tag === 'my_category')
      .children.join(''),
    '网络服务',
  )
  picker().props.onChanged('cloud_storage')
  assert.equal(picker().props.value, 'cloud_storage')
  assert.equal(m.formPayload(page.slots[0]).category, 'cloud_storage')
  assert.equal(
    h
      .load('display-data.ts')
      .displayCategory({ ...c, revision: 'b' }, 'my_category'),
    'my_category',
  )
})
test('CNY cross-rates round to two decimals, never invent missing rates and leave original prices intact', () => {
  const h = harness(),
    p = h.load('presentation.ts'),
    s = {
      ...h.load('model.ts').newSubscription('2026-10-01'),
      currency: 'GBP',
      price: '11',
    }
  assert.equal(p.cnyLabel(s, rates), '≈ CNY 102.67')
  assert.equal(
    p.cnyLabel({ ...s, currency: 'TRY', price: '35.99' }, rates),
    '≈ CNY 6.30',
  )
  assert.equal(p.cnyLabel({ ...s, currency: 'CNY' }, rates), null)
  assert.equal(p.cnyLabel({ ...s, currency: 'XXX' }, rates), '≈ CNY —')
  assert.equal(p.cnyLabel(s, null), '≈ CNY —')
  assert.equal(s.price, '11')
  assert.equal(p.parseRates({ date: 'invalid', usd: rates.usd }), null)
  assert.equal(p.parseRates({ ...rates, usd: { usd: 1, cny: -7 } }), null)
})
test('daily FX falls back anonymously, retains old dated rates offline; custom categories use same-site session', async () => {
  const calls = []
  const h = harness({
    config: c,
    fetcher: async (url, init) => {
      calls.push([url, init])
      if (url.includes('custom-config'))
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              config: {
                categories: [{ value: 'net', labels: { 'zh-CN': '网络' } }],
              },
            },
          }),
        }
      assert.equal(Object.keys(init.headers).length, 0)
      if (url.includes('jsdelivr')) throw Error('blocked')
      return { ok: true, json: async () => rates }
    },
  })
  const d = h.load('display-data.ts')
  await Promise.all([
    d.prepareDisplayData(c, auth),
    d.prepareDisplayData(c, auth),
  ])
  assert.equal(calls.length, 3)
  assert.equal(d.displayCategory(c, 'net'), '网络')
  assert.match(
    calls.find(([u]) => u.includes('custom-config'))[1].headers.Cookie,
    /renewlet_session=test/,
  )
  await d.prepareDisplayData(c, auth)
  assert.equal(calls.length, 3)
  h.data.set('renewlet.fx.v1', { time: 0, rates })
  h.bridge.fetch = async () => {
    throw Error('offline')
  }
  await d.prepareDisplayData(c, auth)
  assert.equal(d.readRates(c).date, '2026-10-09')
  assert.equal(JSON.stringify([...h.data]).includes('renewlet_session'), false)
})
test('disconnect during category request discards old account labels; demo metadata stays offline', async () => {
  let release
  const h = harness({
      config: c,
      fetcher: async (url) => {
        if (!url.includes('custom-config')) throw Error('offline')
        return new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              json: async () => ({
                ok: true,
                data: {
                  config: {
                    categories: [
                      { value: 'net', labels: { 'zh-CN': '旧账户' } },
                    ],
                  },
                },
              }),
            })
        })
      },
    }),
    d = h.load('display-data.ts')
  const job = d.prepareDisplayData(c, auth)
  d.clearCategories()
  release()
  await job
  assert.equal(d.displayCategory(c, 'net'), 'net')
  await d.prepareDisplayData({ ...c, mode: 'demo' }, null)
  assert.ok(d.readRates({ ...c, mode: 'demo' }))
})
