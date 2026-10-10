const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { harness } = require('../tools/harness.cjs')
function core() {
  return harness().load('model.ts')
}
test('date-only is correct near UTC midnight and across DST', () => {
  const m = core()
  assert.equal(
    m.today('Asia/Shanghai', new Date('2026-10-09T16:01:00Z')),
    '2026-10-10',
  )
  assert.equal(
    m.today('America/Los_Angeles', new Date('2026-10-10T02:00:00Z')),
    '2026-10-09',
  )
  assert.equal(m.dayDiff('2026-03-09', '2026-03-07'), 2)
  assert.equal(m.validDate('2026-02-30'), false)
  assert.equal(m.validDate('2024-02-29'), true)
})
test('upcoming excludes overdue, paused, cancelled, expired, buyout; uses trial and term expiry', () => {
  const m = core(),
    make = (changes) => ({
      ...m.newSubscription('2026-10-01'),
      id: String(Math.random()),
      name: 'test',
      nextBillingDate: '2026-10-13',
      ...changes,
    })
  const list = [
    make({}),
    make({ nextBillingDate: '2026-10-09' }),
    make({ status: 'paused' }),
    make({ status: 'cancelled' }),
    make({ status: 'expired' }),
    make({ billingCycle: 'one-time' }),
    make({ status: 'trial', trialEndDate: '2026-10-11' }),
    make({
      billingCycle: 'one-time',
      oneTimeTermCount: 1,
      oneTimeTermUnit: 'year',
    }),
  ]
  const d = m.upcoming(list, '2026-10-10', 7)
  assert.equal(d.length, 3)
  assert.equal(d[0].type, 'trial')
  assert.equal(d[0].days, 1)
  assert.equal(
    d.some((v) => v.type === 'expiry'),
    true,
  )
  assert.equal(m.dueLabel(m.dueFor(list[1], '2026-10-10')), '逾期 1 天')
})
test('totals are exact decimals grouped by currency, no implicit conversion', () => {
  const m = core(),
    items = ['0.1', '0.2'].map((price) => ({
      subscription: { ...m.newSubscription('2026-10-10'), price },
    }))
  items.push({
    subscription: {
      ...m.newSubscription('2026-10-10'),
      price: '10',
      currency: 'USD',
    },
  })
  assert.equal(m.totals(items).join('|'), 'CNY 0.3|USD 10')
  assert.throws(() => m.money('-1'))
  assert.throws(() => m.money('1.1234567'))
  assert.equal(m.money('001.2300'), '1.23')
})
test('sorting preserves source and handles ties, different currencies and missing due dates', () => {
  const m = core(),
    base = m.demoSnapshot('Asia/Shanghai').subscriptions,
    prior = JSON.stringify(base)
  assert.equal(m.sorted(base, 'pinned', '2026-10-10')[0].pinned, true)
  assert.equal(JSON.stringify(base), prior)
  const sorted = m.sorted(base, 'price', '2026-10-10')
  assert.equal(sorted[0].currency, 'CNY')
  assert.equal(sorted[0].price, '88')
})
test('PATCH includes changed fields only, retains extra/advanced metadata, normalizes cycle changes', () => {
  const m = core(),
    before = {
      ...m.newSubscription('2026-10-01'),
      id: 'a',
      name: 'A',
      price: '1',
      costSharing: { enabled: true },
      trialEndDate: '2026-11-01',
    },
    after = { ...before, name: 'B' }
  assert.equal(JSON.stringify(m.changedPayload(before, after)), '{"name":"B"}')
  const change = m.changedPayload(
    {
      ...before,
      billingCycle: 'custom',
      customDays: 3,
      customCycleUnit: 'week',
    },
    { ...before, billingCycle: 'annual' },
  )
  assert.equal(change.customDays, null)
  assert.equal(change.customCycleUnit, null)
  assert.equal('costSharing' in change, false)
})
test('form rejects invalid dates, custom cycle, currency, reminders and term; accepts zero price', () => {
  const m = core(),
    s = { ...m.newSubscription('2026-10-10'), name: 'A' }
  assert.equal(m.formPayload(s).price, '0')
  for (const c of [
    { currency: 'usd' },
    { nextBillingDate: '2026-10-09' },
    { billingCycle: 'custom', customDays: 0 },
    { reminderDays: 1.2 },
    { billingCycle: 'one-time', startDate: null },
    { tags: ['x'.repeat(41)] },
  ])
    assert.throws(() => m.formPayload({ ...s, ...c }))
})
test('configuration keeps demo blank URL, rejects insecure credential-bearing origins', () => {
  const m = core()
  assert.equal(m.parseConfig(m.defaultConfig()).mode, 'demo')
  assert.equal(
    m.normalizeURL('https://example.com/sub/'),
    'https://example.com/sub',
  )
  for (const u of [
    'http://example.com',
    'https://a:b@example.com',
    'https://example.com?q=key',
  ])
    assert.throws(() => m.normalizeURL(u))
})
