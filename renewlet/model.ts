// Wire contract checked against zhiyingzzhou/renewlet cf67d13 (0.3.30).
export const cycles = {
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季',
  'semi-annual': '每半年',
  annual: '每年',
  custom: '自定义',
  'one-time': '一次性',
} as const
export const statuses = {
  active: '进行中',
  trial: '试用中',
  expired: '已到期',
  paused: '已暂停',
  cancelled: '已取消',
} as const
export const units = { day: '天', week: '周', month: '月', year: '年' } as const
export const sorts = {
  due: '最近到期',
  name: '名称 A–Z',
  price: '币种 / 金额 ↓',
  updated: '最近更新',
  pinned: '置顶优先',
} as const
export type Sort = keyof typeof sorts
export type Family = 'systemSmall' | 'systemMedium' | 'systemLarge'
export type Mode = 'demo' | 'public' | 'session'
export interface Config {
  baseURL: string
  mode: Mode
  days: number
  zone: string
  revision: string
}
export interface Subscription {
  id: string
  name: string
  price: string
  currency: string
  billingCycle: keyof typeof cycles
  category: string
  status: keyof typeof statuses
  startDate: string | null
  nextBillingDate: string
  autoRenew: boolean
  autoCalculateNextBillingDate: boolean
  pinned: boolean
  publicHidden: boolean
  customDays?: number
  customCycleUnit?: keyof typeof units
  oneTimeTermCount?: number
  oneTimeTermUnit?: keyof typeof units
  trialEndDate?: string
  website?: string
  notes?: string
  paymentMethod?: string
  tags: string[]
  reminderDays: number
  repeatReminderEnabled: boolean
  repeatReminderInterval: string
  repeatReminderWindow: string
  updatedAt?: string
  createdAt?: string
  costSharing?: Record<string, unknown>
}
export interface Snapshot {
  subscriptions: Subscription[]
  fetchedAt: string
  cached?: boolean
  notice?: string
}
export interface Due {
  subscription: Subscription
  date: string
  days: number
  type: 'renewal' | 'trial' | 'expiry'
}
export function object(x: unknown): Record<string, any> {
  return x && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, any>)
    : {}
}
export function validDate(x: unknown): x is string {
  return (
    typeof x === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    Number.isFinite(Date.parse(x + 'T00:00:00Z')) &&
    new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x
  )
}
export function normalizeURL(input: string): string {
  const u = new URL(input.trim())
  if (
    u.protocol !== 'https:' ||
    !u.hostname ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error('请输入不含凭证、参数的 HTTPS 站点地址')
  return u.toString().replace(/\/+$/, '')
}
export function today(zone: string, now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => p.find((x) => x.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function localDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function pickerDate(d: string): number {
  return new Date(d + 'T12:00:00').getTime()
}
export function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000,
  )
}
export function money(input: string): string {
  const v = input.trim()
  if (!/^\d+(\.\d{1,6})?$/.test(v) || Number(v) > 1e9)
    throw new Error('金额应为 0–10 亿，最多六位小数')
  const [i, f = ''] = v.split('.'),
    fraction = f.replace(/0+$/, '')
  return i.replace(/^0+(?=\d)/, '') + (fraction ? '.' + fraction : '')
}
export function parseSubscription(input: unknown): Subscription {
  const r = object(input)
  if (
    typeof r.id !== 'string' ||
    !r.id ||
    typeof r.name !== 'string' ||
    !r.name ||
    typeof r.price !== 'string' ||
    !/^[A-Z]{3}$/.test(r.currency) ||
    !Object.hasOwn(cycles, r.billingCycle) ||
    !Object.hasOwn(statuses, r.status) ||
    !validDate(r.nextBillingDate) ||
    (r.startDate !== null && !validDate(r.startDate))
  )
    throw new Error('订阅响应格式不兼容')
  const s: Subscription = {
    id: r.id,
    name: r.name,
    price: money(r.price),
    currency: r.currency,
    billingCycle: r.billingCycle,
    category: String(r.category || 'other'),
    status: r.status,
    startDate: r.startDate,
    nextBillingDate: r.nextBillingDate,
    autoRenew: r.autoRenew === true,
    autoCalculateNextBillingDate: r.autoCalculateNextBillingDate === true,
    pinned: r.pinned === true,
    publicHidden: r.publicHidden === true,
    tags: Array.isArray(r.tags)
      ? r.tags.filter((t: unknown) => typeof t === 'string')
      : [],
    reminderDays: Number.isInteger(r.reminderDays) ? r.reminderDays : -1,
    repeatReminderEnabled: r.repeatReminderEnabled === true,
    repeatReminderInterval: r.repeatReminderInterval || '1h',
    repeatReminderWindow: r.repeatReminderWindow || '72h',
  }
  for (const k of [
    'website',
    'notes',
    'paymentMethod',
    'updatedAt',
    'createdAt',
  ] as const)
    if (typeof r[k] === 'string') s[k] = r[k]
  if (validDate(r.trialEndDate)) s.trialEndDate = r.trialEndDate
  if (
    Number.isInteger(r.customDays) &&
    r.customDays > 0 &&
    Object.hasOwn(units, r.customCycleUnit)
  ) {
    s.customDays = r.customDays
    s.customCycleUnit = r.customCycleUnit
  }
  if (
    Number.isInteger(r.oneTimeTermCount) &&
    r.oneTimeTermCount > 0 &&
    Object.hasOwn(units, r.oneTimeTermUnit)
  ) {
    s.oneTimeTermCount = r.oneTimeTermCount
    s.oneTimeTermUnit = r.oneTimeTermUnit
  }
  if (r.costSharing && typeof r.costSharing === 'object')
    s.costSharing = r.costSharing
  return s
}
export function dueFor(s: Subscription, date: string): Due | null {
  if (!['active', 'trial'].includes(s.status)) return null
  // A one-time purchase without a term is a lifetime buyout, not an expiry.
  if (s.billingCycle === 'one-time' && !s.oneTimeTermCount) return null
  const trial = s.status === 'trial' && !!s.trialEndDate
  const d = trial ? s.trialEndDate! : s.nextBillingDate
  return {
    subscription: s,
    date: d,
    days: dayDiff(d, date),
    type: trial
      ? 'trial'
      : s.billingCycle === 'one-time'
        ? 'expiry'
        : 'renewal',
  }
}
export function upcoming(
  list: Subscription[],
  date: string,
  days: number,
): Due[] {
  return list
    .map((s) => dueFor(s, date))
    .filter((d): d is Due => !!d && d.days >= 0 && d.days <= days)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.subscription.name.localeCompare(b.subscription.name) ||
        a.subscription.id.localeCompare(b.subscription.id),
    )
}
export function dueLabel(d: Due | null): string {
  return !d
    ? '无待办日期'
    : d.days < 0
      ? `逾期 ${-d.days} 天`
      : d.days === 0
        ? '今天'
        : d.days === 1
          ? '明天'
          : `${d.days} 天后`
}
export const dueTypes = {
  renewal: '续订',
  trial: '试用结束',
  expiry: '权益到期',
}
export function cycleLabel(s: Subscription): string {
  return s.billingCycle === 'custom'
    ? `每 ${s.customDays ?? '?'} ${units[s.customCycleUnit || 'day']}`
    : s.billingCycle === 'one-time' && s.oneTimeTermCount
      ? `${s.oneTimeTermCount} ${units[s.oneTimeTermUnit || 'day']}权益`
      : cycles[s.billingCycle]
}
export function priceLabel(s: Subscription): string {
  return `${s.currency} ${s.price}`
}
export function sorted(
  list: Subscription[],
  sort: Sort,
  date: string,
): Subscription[] {
  const name = (a: Subscription, b: Subscription) =>
    a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)
  const byDue = (a: Subscription, b: Subscription) =>
    (dueFor(a, date)?.date || '9999').localeCompare(
      dueFor(b, date)?.date || '9999',
    ) || name(a, b)
  return [...list].sort((a, b) =>
    sort === 'name'
      ? name(a, b)
      : sort === 'updated'
        ? (b.updatedAt || '').localeCompare(a.updatedAt || '') || name(a, b)
        : sort === 'pinned'
          ? Number(b.pinned) - Number(a.pinned) || byDue(a, b)
          : sort === 'price'
            ? a.currency.localeCompare(b.currency) ||
              Number(b.price) - Number(a.price) ||
              name(a, b)
            : byDue(a, b),
  )
}
export function totals(items: Due[]): string[] {
  const sums = new Map<string, bigint>()
  for (const { subscription: s } of items) {
    const [i, f = ''] = s.price.split('.')
    sums.set(
      s.currency,
      (sums.get(s.currency) || 0n) +
        BigInt(i) * 1000000n +
        BigInt(f.padEnd(6, '0')),
    )
  }
  return [...sums]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, n]) => {
      const f = (n % 1000000n).toString().padStart(6, '0').replace(/0+$/, '')
      return `${c} ${n / 1000000n}${f ? '.' + f : ''}`
    })
}
export function defaultConfig(): Config {
  return {
    baseURL: '',
    mode: 'demo',
    days: 30,
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    revision: 'initial',
  }
}
export function parseConfig(raw: unknown): Config {
  const r = object(raw),
    d = defaultConfig()
  if (!Object.keys(r).length) return d
  let zone = d.zone
  try {
    today(r.zone)
    if (typeof r.zone === 'string') zone = r.zone
  } catch {}
  return {
    baseURL:
      typeof r.baseURL === 'string' && r.baseURL ? normalizeURL(r.baseURL) : '',
    mode: ['demo', 'public', 'session'].includes(r.mode) ? r.mode : 'demo',
    days: [7, 14, 30, 60, 90].includes(r.days) ? r.days : 30,
    zone,
    revision: typeof r.revision === 'string' ? r.revision : 'initial',
  }
}
export function newSubscription(date: string): Subscription {
  return {
    id: '',
    name: '',
    price: '0',
    currency: 'CNY',
    billingCycle: 'monthly',
    category: 'other',
    status: 'active',
    startDate: date,
    nextBillingDate: date,
    autoRenew: false,
    autoCalculateNextBillingDate: false,
    pinned: false,
    publicHidden: false,
    tags: [],
    reminderDays: -1,
    repeatReminderEnabled: false,
    repeatReminderInterval: '1h',
    repeatReminderWindow: '72h',
  }
}
export function formPayload(s: Subscription): Record<string, unknown> {
  if (!s.name.trim() || s.name.trim().length > 120)
    throw new Error('名称应为 1–120 个字符')
  if (!/^[A-Z]{3}$/.test(s.currency))
    throw new Error('币种请输入三位大写代码，例如 CNY')
  if (!s.category.trim() || s.category.length > 80)
    throw new Error('请填写有效分类')
  if (
    !validDate(s.nextBillingDate) ||
    (s.startDate !== null && !validDate(s.startDate)) ||
    (s.startDate && s.startDate > s.nextBillingDate)
  )
    throw new Error('下次日期不能早于开始日期')
  if (s.trialEndDate && !validDate(s.trialEndDate))
    throw new Error('试用结束日期无效')
  if (
    (s.billingCycle === 'one-time' || s.autoCalculateNextBillingDate) &&
    !s.startDate
  )
    throw new Error('一次性或自动日期计算需要开始日期')
  if (s.website && !/^https?:\/\//.test(s.website))
    throw new Error('网站应以 https:// 或 http:// 开头')
  if (s.notes && s.notes.length > 5000) throw new Error('备注最多 5000 字')
  if (s.tags.length > 100 || s.tags.some((t) => !t.trim() || t.length > 40))
    throw new Error('标签最多 100 个，每个 1–40 字')
  if (
    !Number.isInteger(s.reminderDays) ||
    s.reminderDays < -2 ||
    s.reminderDays > 3650
  )
    throw new Error('提醒天数应为 -2 到 3650 的整数')
  if (
    s.billingCycle === 'custom' &&
    (!Number.isInteger(s.customDays) || s.customDays! < 1 || !s.customCycleUnit)
  )
    throw new Error('请填写正整数自定义周期')
  if (
    s.billingCycle === 'one-time' &&
    s.oneTimeTermCount !== undefined &&
    (!Number.isInteger(s.oneTimeTermCount) ||
      s.oneTimeTermCount < 1 ||
      s.oneTimeTermCount > 3650 ||
      !s.oneTimeTermUnit)
  )
    throw new Error('权益期限应为 1–3650 的整数')
  return {
    name: s.name.trim(),
    price: money(s.price),
    currency: s.currency,
    category: s.category.trim(),
    billingCycle: s.billingCycle,
    status: s.status,
    startDate: s.startDate,
    nextBillingDate: s.nextBillingDate,
    trialEndDate: s.trialEndDate || null,
    autoRenew: s.billingCycle === 'one-time' ? false : s.autoRenew,
    autoCalculateNextBillingDate:
      s.billingCycle === 'one-time' ? false : s.autoCalculateNextBillingDate,
    customDays: s.billingCycle === 'custom' ? s.customDays : null,
    customCycleUnit: s.billingCycle === 'custom' ? s.customCycleUnit : null,
    oneTimeTermCount:
      s.billingCycle === 'one-time' ? (s.oneTimeTermCount ?? null) : null,
    oneTimeTermUnit:
      s.billingCycle === 'one-time' && s.oneTimeTermCount
        ? s.oneTimeTermUnit
        : null,
    website: s.website || null,
    notes: s.notes || null,
    paymentMethod: s.paymentMethod || null,
    tags: s.tags.map((t) => t.trim()),
    reminderDays: s.reminderDays,
  }
}
export function changedPayload(
  before: Subscription,
  after: Subscription,
): Record<string, unknown> {
  const a = formPayload(before),
    b = formPayload(after)
  return Object.fromEntries(
    Object.entries(b).filter(
      ([k, v]) => JSON.stringify(v) !== JSON.stringify(a[k]),
    ),
  )
}
export function demoSnapshot(
  zone = defaultConfig().zone,
  now = new Date(),
): Snapshot {
  const date = today(zone, now),
    add = (n: number) =>
      new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000)
        .toISOString()
        .slice(0, 10)
  const specs = [
    ['iCloud+', '6', 'CNY', 1, 'monthly', '云服务'],
    ['YouTube Premium', '13.99', 'USD', 3, 'monthly', '影音'],
    ['Notion', '10', 'USD', 6, 'monthly', '效率'],
    ['Figma', '15', 'USD', 9, 'monthly', '设计'],
    ['域名 · 小宇宙', '88', 'CNY', 18, 'annual', '开发'],
    ['音乐会员', '18', 'CNY', -2, 'monthly', '影音'],
  ]
  return {
    fetchedAt: now.toISOString(),
    subscriptions: specs.map((r, i) => ({
      ...newSubscription(add(-60)),
      id: `demo-${i}`,
      name: String(r[0]),
      price: String(r[1]),
      currency: String(r[2]),
      nextBillingDate: add(Number(r[3])),
      billingCycle: r[4] as Subscription['billingCycle'],
      category: String(r[5]),
      autoRenew: i !== 4,
      pinned: i === 0,
      notes: '虚构演示订阅，可放心尝试编辑。',
      updatedAt: now.toISOString(),
    })),
    notice: '演示数据 · 非真实账单',
  }
}
