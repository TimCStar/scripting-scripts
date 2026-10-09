import { normalizeAccount, type AccountView, type Config } from './model'
export type FetchLike = (url: string, options: {method:string;headers:Record<string,string>;timeout:number;handleRedirect:()=>Promise<null>}) => Promise<{ok:boolean;status:number;json:()=>Promise<unknown>}>
export type Auth = { kind: 'apiKey' | 'jwt'; token: string }
export type LoadResult = { accounts: AccountView[]; fetchedAt: string; errors: Record<string,string> }
function data(value: unknown): unknown {
  if (!value || typeof value !== 'object') throw new Error('服务器返回格式不兼容')
  const envelope = value as {code?:number;data?:unknown}
  if (envelope.code !== 0 || !('data' in envelope)) throw new Error('接口版本或权限不兼容')
  return envelope.data
}
export async function loadAccounts(config: Config, auth: Auth, fetcher: FetchLike, previous: AccountView[] = []): Promise<LoadResult> {
  // The GET allowlist is intentionally closed. Never call /usage, test, refresh or token endpoints.
  const headers:Record<string,string> = auth.kind === 'jwt' ? {Authorization:`Bearer ${auth.token}`} : {'x-api-key':auth.token}
  async function get(path: string): Promise<unknown> {
    const response = await fetcher(`${config.baseURL}/api/v1/admin/${path}`,{method:'GET',headers,timeout:8,handleRedirect:async()=>null})
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '管理凭证失效或权限不足' : response.status === 404 ? '接口或账号不存在' : `服务器暂不可用（${response.status}）`)
    return data(await response.json())
  }
  const groupPromise = get('groups/all?include_inactive=true').catch(()=>null)
  const errors: Record<string,string> = {}
  // Caller constrains widget reads to 1/2/4 visible accounts. All requests are passive reads.
  const accounts = await Promise.all(config.accountIDs.map(async id => {
    try {
      const [raw, statsResult, rows] = await Promise.all([get(`accounts/${id}`),get(`accounts/${id}/today-stats`).catch(()=>null),groupPromise])
      const groups: Record<string,string> = {}
      if (Array.isArray(rows)) for (const row of rows) if (row && Number.isSafeInteger(row.id) && typeof row.name === 'string') groups[String(row.id)] = row.name.slice(0,30)
      const account = normalizeAccount(raw,statsResult,groups)
      if (account.id !== id) throw new Error('账号响应不匹配')
      if (statsResult === null) account.error = '今日统计暂不可用'
      return account
    } catch (error) {
      const message = error instanceof Error && /^(管理凭证|接口|服务器|账号响应)/.test(error.message) ? error.message : '网络连接失败'
      errors[String(id)] = message
      const cached = previous.find(x => x.id === id)
      return cached ? {...cached,error:message} : {id,name:`账号 #${id}`,provider:'other' as const,groups:[],status:'未知',windows:[],todayCost:null,todayTokens:null,estimate:'额度未提供',fetchedAt:'',error:message}
    }
  }))
  return {accounts,fetchedAt:new Date().toISOString(),errors}
}
