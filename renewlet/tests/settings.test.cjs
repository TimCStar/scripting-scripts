const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, walk } = require('../tools/harness.cjs')
const config = {
  baseURL: 'https://example.test',
  mode: 'session',
  days: 30,
  zone: 'Asia/Shanghai',
  revision: 'test',
}
function pageFor(h) {
  const page = h.renderComponent(h.load('settings.tsx').Settings)
  const node = (type, title) =>
    walk(page.render()).find((n) => n.type === type && n.props.title === title)
  return {
    page,
    node,
    login: () => node('Button', '登录并保存连接').props.action(),
  }
}
function sessionReply() {
  return {
    ok: true,
    status: 200,
    cookies: [
      { name: 'renewlet_session', value: 'session-test' },
      { name: 'renewlet_csrf', value: 'csrf-test' },
    ],
    json: async () => ({
      ok: true,
      data: { type: 'session', session: { expiresAt: '2099-01-01T00:00:00Z' } },
    }),
  }
}

test('settings exposes a SecureField and sends its exact password without a password dialog or persistent copy', async () => {
  let submitted,
    logins = 0
  const h = harness({
    config,
    fetcher: async (url, init) => {
      if (url.endsWith('/auth/login')) {
        logins++
        submitted = JSON.parse(init.body)
        return sessionReply()
      }
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
  h.bridge.Dialog.prompt = async () => {
    throw Error('Password must be entered inline')
  }
  const { page, node, login } = pageFor(h)
  node('TextField', '登录邮箱').props.onChanged('test@example.com')
  const fakePassword = ' test-password-value '
  node('SecureField', '登录密码').props.onChanged(fakePassword)
  await login()
  assert.equal(logins, 1)
  assert.equal(submitted.password, fakePassword)
  assert.equal(node('SecureField', '登录密码').props.value, '')
  assert.equal(h.result.dismissed, true)
  assert.equal(
    JSON.stringify([...h.data, ...h.keys]).includes(fakePassword),
    false,
  )
  assert.equal(
    h.load('state.ts').credential(h.load('state.ts').readConfig()).session,
    'session-test',
  )
})

test('empty password produces an explicit message and no network request; failed login clears submitted password', async () => {
  let requests = 0
  const h = harness({
    config,
    fetcher: async () => {
      requests++
      return { ok: false, status: 401 }
    },
  })
  const { page, node, login } = pageFor(h)
  node('TextField', '登录邮箱').props.onChanged('test@example.com')
  await login()
  assert.equal(requests, 0)
  assert.ok(
    walk(page.render()).some(
      (n) =>
        n.type === 'Text' && n.children.join('').includes('请填写登录密码'),
    ),
  )
  node('SecureField', '登录密码').props.onChanged('test-password')
  await login()
  assert.equal(requests, 1)
  assert.equal(node('SecureField', '登录密码').props.value, '')
  assert.equal(h.result.dismissed, undefined)
  assert.equal(h.keys.size, 0)
})

test('changing connection mode and leaving settings clears the password', () => {
  const h = harness({ config }),
    { page, node } = pageFor(h)
  node('SecureField', '登录密码').props.onChanged('test-password')
  node('Picker', '连接模式').props.onChanged('public')
  assert.equal(node('SecureField', '登录密码'), undefined)
  node('Picker', '连接模式').props.onChanged('session')
  assert.equal(node('SecureField', '登录密码').props.value, '')
  node('SecureField', '登录密码').props.onChanged('test-password')
  page.render().props.onDisappear()
  assert.equal(node('SecureField', '登录密码').props.value, '')
})
