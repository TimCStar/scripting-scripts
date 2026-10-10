import { normalizeAccount, localDay, nonnegative, estimatedTotalCost, sevenDayCostStart, accountLogCost, isStale, type Window, type AccountView, type Config } from './model'
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
  // Closed GET routes only: account, local usage/stats and local usage logs.
  // Never call account /usage, OpenAI /quota, inference, reset, refresh or token endpoints.
  const headers:Record<string,string> = auth.kind === 'jwt' ? {Authorization:`Bearer ${auth.token}`} : {'x-api-key':auth.token}
  async function get(path: string): Promise<unknown> {
    const response = await fetcher(`${config.baseURL}/api/v1/admin/${path}`,{method:'GET',headers,timeout:8,handleRedirect:async()=>null})
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '管理凭证失效或权限不足' : response.status === 404 ? '接口或账号不存在' : `服务器暂不可用（${response.status}）`)
    return data(await response.json())
  }
  const errors: Record<string,string> = {}
  // Caller constrains widget reads to 1/2/4 visible accounts. All requests are passive reads.
  const accounts = await Promise.all(config.accountIDs.map(async id => {
    try {
      const raw = await get(`accounts/${id}`)
      const account = normalizeAccount(raw,null,{})
      if (account.id !== id) throw new Error('账号响应不匹配')
      if(account.provider==='openai'||account.provider==='anthropic') {
        const weekly=account.windows.find(w=>w.label==='7d')
        if(weekly) await attachSevenDayCost(weekly,id,get,config.staleMinutes)
      }
      await attachTodayCost(account,get)
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

function object(value:unknown):Record<string,unknown> {return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}
const DAY=86400000, PAGE_SIZE=500, MAX_PAGES=4
/** The dashboard sums from reset−7d. Aggregate complete UTC dates server-side;
 * only the first partial date needs raw records. No raw log is retained in cache.
 * Pagination has no transaction snapshot: reject changed totals/duplicate IDs.
 */
export async function attachSevenDayCost(window:Window,id:number,get:(path:string)=>Promise<unknown>,staleMinutes:number,now=Date.now()):Promise<void> {
  window.usedUSD=null;window.estimatedTotalUSD=null;window.costStatus='unavailable'
  const wallStart=Date.now()
  const start=sevenDayCostStart(window,now)
  if(start===null)return
  const dayStart=Math.floor(start/DAY)*DAY, wholeStart=start===dayStart?dayStart:dayStart+DAY
  const date=(t:number)=>new Date(t).toISOString().slice(0,10)
  let cost=0
  try {
    if(wholeStart<=now) {
      const stats=object(await get(`usage/stats?account_id=${id}&start_date=${date(wholeStart)}&end_date=${date(now)}&timezone=UTC&nocache=true`))
      const full=nonnegative(stats.total_account_cost)
      if(full===null)return
      cost=full
    }
    if(start!==dayStart) {
      let expected:number|null=null, seen=0, lastID=0
      for(let page=1;page<=MAX_PAGES;page++) {
        const payload=object(await get(`usage?account_id=${id}&start_date=${date(start)}&end_date=${date(start)}&timezone=UTC&exact_total=true&sort_by=id&sort_order=asc&page_size=${PAGE_SIZE}&page=${page}`))
        const total=nonnegative(payload.total)
        if(total===null||!Number.isSafeInteger(total)||!Array.isArray(payload.items)||payload.page!==page||payload.page_size!==PAGE_SIZE)return
        if(total>PAGE_SIZE*MAX_PAGES){window.costStatus='truncated';return}
        if(expected!==null&&total!==expected)return
        expected=total
        if(payload.items.length!==Math.min(PAGE_SIZE,total-seen))return
        for(const row of payload.items) {
          const r=object(row), nextID=Number(r.id)
          if(!Number.isSafeInteger(nextID)||nextID<=lastID)return
          lastID=nextID
          const amount=accountLogCost(row,id,start,wholeStart-1)
          if(amount===null)return
          cost+=amount;seen++
        }
        if(seen===expected)break
        if(page===MAX_PAGES){window.costStatus='truncated';return}
      }
    }
    if(!Number.isFinite(cost)||now+(Date.now()-wallStart)>=Date.parse(window.resetsAt!))return
    window.usedUSD=cost
    window.estimatedTotalUSD=isStale(window.updatedAt,staleMinutes,now)?null:estimatedTotalCost(cost,window.percent)
    window.costStatus='complete'
  }catch { /* Keep other account metrics and omit unverified quota dollars. */ }
}

/** Today uses local recorded account cost, never provider probes or user-billed cost. */
export async function attachTodayCost(account:AccountView,get:(path:string)=>Promise<unknown>,now=Date.now(),timeZone?:string):Promise<void> {
  account.todayCost=null;delete account.todayDate;delete account.todayTimeZone;delete account.todayUpdatedAt
  const day=localDay(now,timeZone),wallStart=Date.now()
  if(!day)return
  try {
    const stats=object(await get(`usage/stats?account_id=${account.id}&start_date=${day.date}&end_date=${day.date}&timezone=${encodeURIComponent(day.timeZone)}&nocache=true`))
    const cost=nonnegative(stats.total_account_cost),finished=now+(Date.now()-wallStart)
    if(cost===null||localDay(finished,day.timeZone)?.date!==day.date)return
    account.todayCost=cost;account.todayDate=day.date;account.todayTimeZone=day.timeZone;account.todayUpdatedAt=new Date(finished).toISOString()
  }catch { /* A failed statistic is unknown, not zero or a new timestamp on old cost. */ }
}
