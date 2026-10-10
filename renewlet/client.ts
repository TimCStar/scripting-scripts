import {
  normalizeURL,
  object,
  parseSubscription,
  type Subscription,
} from './model'
export interface Credential {
  mode: 'public' | 'session'
  token?: string
  session?: string
  csrf?: string
  expiresAt?: string
}
export interface Reply {
  ok: boolean
  status: number
  cookies?: { name: string; value: string }[]
  json(): Promise<unknown>
}
export type Fetcher = (
  url: string,
  init: {
    method: string
    headers: Record<string, string>
    body?: string
    timeout: number
    handleRedirect: () => Promise<null>
  },
) => Promise<Reply>
export class ClientError extends Error {}
export function errorMessage(e: unknown): string {
  return e instanceof ClientError
    ? e.message
    : '连接或数据校验失败，请检查网络和站点版本'
}
export class RenewletClient {
  readonly baseURL: string
  constructor(
    baseURL: string,
    readonly credential: Credential | null,
    readonly fetcher: Fetcher,
  ) {
    this.baseURL = normalizeURL(baseURL)
  }
  private async request(
    path: string,
    method = 'GET',
    body?: unknown,
    anonymous = false,
  ): Promise<{ data: Record<string, any>; response: Reply }> {
    const c = anonymous ? null : this.credential
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Renewlet-Locale': 'zh-CN',
    }
    if (c?.mode === 'public') {
      if (method !== 'GET' || !path.startsWith('/api/public/v1/'))
        throw new ClientError('Public API Token 仅可读取，请在设置中登录后编辑')
      if (!c.token || /[\r\n]/.test(c.token))
        throw new ClientError('请保存有效的 Public API Token')
      headers.Authorization = 'Bearer ' + c.token
    } else if (c?.mode === 'session') {
      if (!c.session || !c.csrf || /[;\s]/.test(c.session + c.csrf))
        throw new ClientError('请重新登录 Renewlet')
      if (
        !c.expiresAt ||
        Date.parse(c.expiresAt) <= Date.now() ||
        !Number.isFinite(Date.parse(c.expiresAt))
      )
        throw new ClientError('登录会话已过期，请重新登录')
      headers.Cookie = `renewlet_session=${c.session}; renewlet_csrf=${c.csrf}`
      if (method !== 'GET') headers['X-Renewlet-CSRF'] = c.csrf
    } else if (!anonymous) throw new ClientError('尚未连接，请打开设置')
    if (method !== 'GET') headers.Origin = new URL(this.baseURL).origin
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await this.fetcher(this.baseURL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      timeout: 15,
      handleRedirect: async () => null,
    })
    // Never surface arbitrary server text: it may contain credentials or proxy diagnostics.
    if (!response.ok)
      throw new ClientError(
        response.status === 401
          ? '凭证无效或已过期，请重新登录 / 检查 Token'
          : response.status === 403
            ? '访问被拒绝：检查 CSRF、站点权限或 Turnstile 设置'
            : response.status === 404
              ? '接口不存在：需要兼容 Renewlet 0.3.30 的站点'
              : response.status === 429
                ? '请求过于频繁，请稍后再试'
                : response.status >= 500
                  ? 'Renewlet 服务器暂不可用'
                  : `请求未成功（HTTP ${response.status}）`,
      )
    const raw = object(await response.json())
    if (raw.ok !== true || !raw.data || typeof raw.data !== 'object')
      throw new ClientError('响应格式不兼容，请检查站点版本')
    return { data: object(raw.data), response }
  }
  private prefix() {
    return this.credential?.mode === 'public'
      ? '/api/public/v1/subscriptions'
      : '/api/app/subscriptions'
  }
  async list(): Promise<Subscription[]> {
    const result: Subscription[] = [],
      ids = new Set<string>(),
      cursors = new Set<string>()
    let cursor: string | null = null
    for (let page = 0; page < 500; page++) {
      const { data } = await this.request(
        this.prefix() +
          '?limit=100' +
          (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
      )
      if (
        !Array.isArray(data.subscriptions) ||
        !(data.nextCursor === null || typeof data.nextCursor === 'string')
      )
        throw new ClientError('分页响应格式不兼容')
      for (const row of data.subscriptions) {
        const s = parseSubscription(row)
        if (!ids.has(s.id)) {
          ids.add(s.id)
          result.push(s)
        }
      }
      if (data.nextCursor === null) return result
      if (!data.nextCursor || cursors.has(data.nextCursor))
        throw new ClientError('服务器返回了重复分页游标，请重试')
      cursor = data.nextCursor
      cursors.add(cursor!)
    }
    throw new ClientError('订阅分页过多，请使用网页查看')
  }
  async detail(id: string): Promise<Subscription> {
    if (!id) throw new ClientError('订阅 ID 不能为空')
    const { data } = await this.request(
      this.prefix() + '/' + encodeURIComponent(id),
    )
    return parseSubscription(data.subscription)
  }
  async save(
    id: string | null,
    payload: Record<string, unknown>,
  ): Promise<Subscription> {
    if (this.credential?.mode !== 'session')
      throw new ClientError('添加或编辑需要登录会话')
    const { data } = await this.request(
      '/api/app/subscriptions' + (id ? '/' + encodeURIComponent(id) : ''),
      id ? 'PATCH' : 'POST',
      payload,
    )
    return parseSubscription(data.subscription)
  }
  async login(
    email: string,
    password: string,
  ): Promise<{ credential?: Credential; ticket?: string; methods?: string[] }> {
    const { data, response } = await this.request(
      '/api/app/auth/login',
      'POST',
      { email: email.trim(), password },
      true,
    )
    if (data.type === 'mfa_required' && typeof data.ticketId === 'string')
      return { ticket: data.ticketId, methods: data.methods }
    return { credential: this.sessionFrom(data, response) }
  }
  async verify(
    ticketId: string,
    code: string,
    method: 'totp' | 'recovery_code',
  ): Promise<Credential> {
    const { data, response } = await this.request(
      '/api/app/auth/mfa/verify',
      'POST',
      { ticketId, code: code.trim(), method },
      true,
    )
    return this.sessionFrom(data, response)
  }
  private sessionFrom(data: Record<string, any>, response: Reply): Credential {
    const session = response.cookies?.find(
        (c) => c.name === 'renewlet_session',
      )?.value,
      csrf = response.cookies?.find((c) => c.name === 'renewlet_csrf')?.value,
      expiresAt = object(data.session).expiresAt
    if (
      data.type !== 'session' ||
      !session ||
      !csrf ||
      !Number.isFinite(Date.parse(expiresAt))
    )
      throw new ClientError('未收到登录 Cookie，请检查站点反向代理')
    return { mode: 'session', session, csrf, expiresAt }
  }
  async logout(): Promise<void> {
    await this.request('/api/app/auth/logout', 'POST')
  }
}
