import { object, type Subscription } from './model'

export const categories: Record<string, string> = {
  productivity: '生产力',
  entertainment: '娱乐',
  lifestyle: '生活',
  finance: '理财',
  streaming: '影音流媒体',
  music: '音乐',
  gaming: '游戏',
  utilities: '公用事业',
  cloud_storage: '云存储',
  education: '教育',
  health_fitness: '健康健身',
  food_dining: '餐饮',
  shopping: '购物',
  travel: '旅行出行',
  business: '商务',
  communication: '通讯与邮件',
  developer_tools: '开发工具',
  design: '设计创意',
  ai_tools: 'AI 工具',
  security_vpn: '安全与 VPN',
  hosting_domains: '域名与托管',
  news_media: '新闻媒体',
  other: '其他',
}
export function categoryLabel(
  value: string,
  custom: Record<string, string> = {},
) {
  return Object.hasOwn(custom, value)
    ? custom[value]
    : Object.hasOwn(categories, value)
      ? categories[value]
      : value
}
// Built-in values from Renewlet's shared config; values stay unchanged on save.
export const paymentMethods: Record<string, string> = {
  alipay: '支付宝',
  wechat: '微信支付',
  credit_card: '信用卡',
  debit_card: '借记卡',
  paypal: 'PayPal',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  bank_transfer: '银行转账',
  crypto: '加密货币',
  direct_debit: '直接扣款',
  money: '现金',
  samsung_pay: 'Samsung Pay',
  klarna: 'Klarna',
  amazon_pay: 'Amazon Pay',
  sepa: 'SEPA',
  skrill: 'Skrill',
  sofort: 'Sofort',
  stripe: 'Stripe',
  affirm: 'Affirm',
  elo: 'Elo',
  facebook_pay: 'Meta Pay',
  giropay: 'GiroPay',
  ideal: 'iDEAL',
  union_pay: '银联',
  interac: 'Interac',
  paysafe: 'Paysafe',
  poli: 'POLi',
  qiwi: 'QIWI',
  shop_pay: 'Shop Pay',
  venmo: 'Venmo',
  verifone: 'Verifone',
  webmoney: 'WebMoney',
  other: '其他',
}
export function paymentLabel(value = '', custom: Record<string, string> = {}) {
  return Object.hasOwn(custom, value)
    ? custom[value]
    : Object.hasOwn(paymentMethods, value)
      ? paymentMethods[value]
      : value
}
export function repeatReminderLabel(s: Subscription) {
  if (!s.repeatReminderEnabled) return '关闭'
  const intervals: Record<string, string> = {
    '1h': '每 1 小时',
    '3h': '每 3 小时',
    '6h': '每 6 小时',
    '12h': '每 12 小时',
    '24h': '每 24 小时',
  }
  const windows: Record<string, string> = {
    '24h': '到期前 24 小时内',
    '48h': '到期前 48 小时内',
    '72h': '到期前 72 小时内',
    full: '首次提醒后至到期',
  }
  return Object.hasOwn(intervals, s.repeatReminderInterval) &&
    Object.hasOwn(windows, s.repeatReminderWindow)
    ? `${intervals[s.repeatReminderInterval]} · ${windows[s.repeatReminderWindow]}`
    : '已开启（规则请在网页查看）'
}
export function parseCategories(input: unknown): Record<string, string> {
  const result: Record<string, string> = Object.create(null)
  if (!Array.isArray(input)) return result
  for (const raw of input.slice(0, 200)) {
    const item = object(raw),
      label = object(item.labels)['zh-CN']
    if (
      typeof item.value === 'string' &&
      item.value.length <= 80 &&
      typeof label === 'string' &&
      label.trim() &&
      label.length <= 80
    )
      result[item.value] = label.trim()
  }
  return result
}
export interface Rates {
  date: string
  usd: Record<string, number>
}
export function parseRates(input: unknown): Rates | null {
  const raw = object(input),
    values = object(raw.usd)
  if (
    typeof raw.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) ||
    !Number.isFinite(Date.parse(raw.date))
  )
    return null
  const usd: Record<string, number> = Object.create(null)
  for (const [code, value] of Object.entries(values))
    if (
      /^[a-z]{3}$/.test(code) &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value > 0
    )
      usd[code] = value
  if (!usd.cny || usd.usd !== 1) return null
  return { date: raw.date, usd }
}
export function cnyLabel(s: Subscription, rates: Rates | null): string | null {
  if (s.currency === 'CNY') return null
  const rate = rates?.usd[s.currency.toLowerCase()]
  if (!rate || !rates) return '≈ CNY —'
  const value = (Number(s.price) * rates.usd.cny) / rate
  return Number.isFinite(value) ? `≈ CNY ${value.toFixed(2)}` : '≈ CNY —'
}
