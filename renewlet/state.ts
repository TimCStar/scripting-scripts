import { fetch, Widget } from 'scripting'
import { clearLogos, prepareLogos } from './icons'
import {
  RenewletClient,
  ClientError,
  errorMessage,
  type Credential,
  type Fetcher,
} from './client'
import {
  defaultConfig,
  parseConfig,
  object,
  demoSnapshot,
  parseSubscription,
  formPayload,
  changedPayload,
  sorts,
  type Sort,
  type Config,
  type Snapshot,
  type Subscription,
} from './model'
const CONFIG = 'renewlet.config.v1',
  CACHE = 'renewlet.snapshot.v1',
  DEMO = 'renewlet.demo.v1',
  SORT = 'renewlet.sort.v1'
function store(key: string, value: unknown) {
  if (!Storage.set(key, value)) throw new ClientError('本机保存失败，请重试')
}
export function readConfig(): Config {
  try {
    return parseConfig(Storage.get(CONFIG))
  } catch {
    return { ...defaultConfig(), mode: 'public', revision: 'invalid' }
  }
}
export function readSort(): Sort {
  const s = Storage.get(SORT)
  return typeof s === 'string' && Object.hasOwn(sorts, s) ? (s as Sort) : 'due'
}
export function saveSort(s: Sort) {
  store(SORT, s)
}
function authKey(c: Config) {
  return 'renewlet.auth.' + encodeURIComponent(c.baseURL) + '.' + c.mode
}
export function credential(c: Config): Credential | null {
  if (c.mode === 'demo') return null
  const raw = Keychain.get(authKey(c))
  if (!raw) return null
  const r = object(JSON.parse(raw))
  return r.baseURL === c.baseURL && r.mode === c.mode
    ? (r.credential as Credential)
    : null
}
export function saveConnection(c: Config, secret?: Credential) {
  if (
    c.mode !== 'demo' &&
    secret &&
    !Keychain.set(
      authKey(c),
      JSON.stringify({ baseURL: c.baseURL, mode: c.mode, credential: secret }),
      { accessibility: 'first_unlock_this_device', synchronizable: false },
    )
  )
    throw new ClientError('钥匙串保存失败')
  store(CONFIG, c)
  store(CACHE, null)
  clearLogos()
  Widget.reloadAll()
}
export function client(c: Config) {
  return new RenewletClient(c.baseURL, credential(c), fetch as Fetcher)
}
export async function loadLogos(c: Config, list: Subscription[]) {
  try {
    await prepareLogos(c, list, credential(c))
  } catch {}
}
export function initial(c = readConfig()): Snapshot {
  try {
    const raw = object(Storage.get(c.mode === 'demo' ? DEMO : CACHE))
    if (
      (c.mode === 'demo' || raw.revision === c.revision) &&
      Array.isArray(raw.subscriptions) &&
      typeof raw.fetchedAt === 'string' &&
      Number.isFinite(Date.parse(raw.fetchedAt))
    )
      return {
        subscriptions: raw.subscriptions.map(parseSubscription),
        fetchedAt: raw.fetchedAt,
        cached: c.mode !== 'demo',
        notice: c.mode === 'demo' ? '演示数据 · 非真实账单' : undefined,
      }
  } catch {}
  return c.mode === 'demo'
    ? demoSnapshot(c.zone)
    : { subscriptions: [], fetchedAt: '', notice: '打开设置连接你的 Renewlet' }
}
const pending = new Map<string, Promise<Snapshot>>()
let generation = 0
export function refresh(c = readConfig()): Promise<Snapshot> {
  if (c.mode === 'demo') return Promise.resolve(initial(c))
  const requestKey = c.revision + ':' + generation
  if (pending.has(requestKey)) return pending.get(requestKey)!
  const start = generation
  const job = (async () => {
    try {
      const subscriptions = await client(c).list()
      if (readConfig().revision !== c.revision || generation !== start)
        return initial(readConfig())
      const snap = { subscriptions, fetchedAt: new Date().toISOString() }
      store(CACHE, { ...snap, revision: c.revision })
      return snap
    } catch (e) {
      return { ...initial(c), cached: true, notice: errorMessage(e) }
    }
  })()
  pending.set(requestKey, job)
  job.finally(() => pending.delete(requestKey))
  return job
}
export async function detail(c: Config, id: string): Promise<Subscription> {
  if (c.mode === 'demo') {
    const s = initial(c).subscriptions.find((s) => s.id === id)
    if (!s) throw new ClientError('订阅已不存在')
    return s
  }
  const s = await client(c).detail(id)
  if (readConfig().revision !== c.revision)
    throw new ClientError('连接设置已改变，请返回列表刷新')
  return s
}
let writing = false
export async function save(
  c: Config,
  before: Subscription | null,
  after: Subscription,
): Promise<Subscription> {
  if (writing) throw new ClientError('正在保存，请稍候')
  if (readConfig().revision !== c.revision)
    throw new ClientError('连接设置已改变，请重新打开表单')
  writing = true
  try {
    const prior = initial(c)
    const payload = before
      ? changedPayload(before, after)
      : {
          ...formPayload(after),
          pinned: false,
          publicHidden: false,
          repeatReminderEnabled: false,
          repeatReminderInterval: '1h',
          repeatReminderWindow: '72h',
        }
    if (before && !Object.keys(payload).length) return before
    let saved: Subscription
    if (c.mode === 'demo') {
      saved = {
        ...after,
        id: before?.id || 'demo-' + Date.now(),
        updatedAt: new Date().toISOString(),
      }
      const s = initial(c)
      s.subscriptions = before
        ? s.subscriptions.map((x) => (x.id === before.id ? saved : x))
        : [...s.subscriptions, saved]
      store(DEMO, { ...s, fetchedAt: new Date().toISOString() })
    } else {
      if (c.mode !== 'session')
        throw new ClientError('Public API Token 仅可读取，请登录后编辑')
      // Fetch full detail before PATCH, and reject concurrent remote changes.
      if (before) {
        const fresh = await detail(c, before.id)
        if (
          JSON.stringify(formPayload(fresh)) !==
            JSON.stringify(formPayload(before)) ||
          fresh.updatedAt !== before.updatedAt
        )
          throw new ClientError(
            '这笔订阅已在其他设备更新，请返回详情重新读取后编辑',
          )
      }
      saved = await client(c).save(before?.id || null, payload)
      generation++
      // Keep other subscriptions at their original snapshot time, while updating this confirmed write.
      // An old in-flight list must not overwrite it. Never cache into a newly selected account.
      if (readConfig().revision === c.revision)
        Storage.set(CACHE, {
          revision: c.revision,
          fetchedAt: prior.fetchedAt || new Date().toISOString(),
          subscriptions: before
            ? prior.subscriptions.map((s) => (s.id === saved.id ? saved : s))
            : [...prior.subscriptions, saved],
        })
    }
    Widget.reloadAll()
    return saved
  } finally {
    writing = false
  }
}
export async function disconnect(c: Config) {
  if (c.mode === 'session' && credential(c)) await client(c).logout()
  forget(c)
}
export function forget(c: Config) {
  const key = authKey(c)
  if (Keychain.get(key) !== null && !Keychain.remove(key))
    throw new ClientError('钥匙串移除失败')
  generation++
  clearLogos()
  store(CACHE, null)
  store(CONFIG, { ...c, revision: String(Date.now()) })
  Widget.reloadAll()
}
export function resetDemo() {
  store(DEMO, null)
  Widget.reloadAll()
}
