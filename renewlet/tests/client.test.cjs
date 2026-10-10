const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { harness } = require('../tools/harness.cjs')
const reply = (data, status = 200, cookies = []) => ({
  ok: status === 200,
  status,
  cookies,
  json: async () => ({ ok: true, data }),
})
function setup(fetcher, cred = { mode: 'public', token: 'test-token' }) {
  const h = harness()
  return {
    h,
    client: new (h.load('client.ts').RenewletClient)(
      'https://example.test/sub',
      cred,
      fetcher,
    ),
    m: h.load('model.ts'),
  }
}
test('list follows opaque cursors, deduplicates ids, leaves credentials in headers and rejects redirects', async () => {
  let calls = []
  const { client, m } = setup(async (url, init) => {
    calls.push({ url, init })
    return reply({
      subscriptions: [
        {
          ...m.newSubscription('2026-10-10'),
          id: calls.length === 1 ? 'a' : 'b',
          name: 'A',
        },
      ],
      nextCursor: calls.length === 1 ? 'c+/?' : null,
    })
  })
  assert.equal((await client.list()).length, 2)
  assert.match(calls[1].url, /cursor=c%2B%2F%3F/)
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token')
  assert.equal(calls[0].url.includes('test-token'), false)
  assert.equal(await calls[0].init.handleRedirect(), null)
})
test('repeated cursor and malformed response fail rather than treating a partial list as all', async () => {
  const { client } = setup(async () =>
    reply({ subscriptions: [], nextCursor: 'loop' }),
  )
  await assert.rejects(() => client.list(), /重复/)
  const bad = setup(async () =>
    reply({ subscriptions: [{ id: 'bad' }], nextCursor: null }),
  ).client
  await assert.rejects(() => bad.list())
})
test('read-only tokens cannot write; session PATCH uses CSRF, origin, escaped id', async () => {
  const ro = setup(() => {
    throw Error('must not fetch')
  }).client
  await assert.rejects(() => ro.save(null, {}), /登录/)
  let call
  const { client, m } = setup(
    async (url, init) => {
      call = { url, init }
      return reply({
        subscription: {
          ...m.newSubscription('2026-10-10'),
          id: 'a/b',
          name: 'A',
        },
      })
    },
    {
      mode: 'session',
      session: 's',
      csrf: 'c',
      expiresAt: '2099-01-01T00:00:00Z',
    },
  )
  await client.save('a/b', { name: 'B' })
  assert.equal(call.init.method, 'PATCH')
  assert.equal(call.init.headers.Cookie, 'renewlet_session=s; renewlet_csrf=c')
  assert.equal(call.init.headers['X-Renewlet-CSRF'], 'c')
  assert.equal(call.init.headers.Origin, 'https://example.test')
  assert.match(call.url, /a%2Fb$/)
})
test('session expiry stops requests and errors never echo server secrets', async () => {
  const expired = setup(
    () => {
      throw Error('must not fetch')
    },
    {
      mode: 'session',
      session: 's',
      csrf: 'c',
      expiresAt: '2000-01-01T00:00:00Z',
    },
  ).client
  await assert.rejects(() => expired.list(), /过期/)
  const denied = setup(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ password: 'SECRET' }),
  })).client
  await assert.rejects(
    () => denied.list(),
    (e) => !e.message.includes('SECRET') && /凭证/.test(e.message),
  )
})
test('native login extracts only session and CSRF cookies, MFA is a separate exchange', async () => {
  let count = 0
  const { client } = setup(
    async () =>
      ++count === 1
        ? reply({ type: 'mfa_required', ticketId: 'ticket', methods: ['totp'] })
        : reply(
            { type: 'session', session: { expiresAt: '2099-01-01T00:00:00Z' } },
            200,
            [
              { name: 'renewlet_session', value: 'session' },
              { name: 'renewlet_csrf', value: 'csrf' },
              { name: 'tracking', value: 'ignored' },
            ],
          ),
    null,
  )
  assert.equal(
    (await client.login('test@example.com', 'fake')).ticket,
    'ticket',
  )
  const cred = await client.verify('ticket', '123456', 'totp')
  assert.equal(cred.session, 'session')
  assert.equal(cred.csrf, 'csrf')
  assert.equal('tracking' in cred, false)
})
