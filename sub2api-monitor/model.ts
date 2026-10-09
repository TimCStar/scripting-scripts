/** Pure data layer. Never retain server objects or credentials in a model/cache. */
export type Provider = 'openai' | 'anthropic' | 'antigravity' | 'other'
export type Window = { label: string; percent: number | null; resetsAt: string | null; updatedAt: string | null; detail?: string }
export type AccountView = {
  id: number; name: string; provider: Provider; groups: string[]; status: string;
  windows: Window[]; todayCost: number | null; todayTokens: number | null; todayRequests?: number | null;
  resetCredits?: {available:number|null;expiresAt:string|null;automatic:boolean|null;state:string|null;stateAt:string|null};
  estimate: string; fetchedAt: string; error?: string
}
export type Config = { version: 1; baseURL: string; accountIDs: number[]; demo: boolean; refreshMinutes: number; staleMinutes: number; revision?:string; referenceCaps?: Record<string, {fiveHour?:number;sevenDay?:number}> }
export const DEFAULT_CONFIG: Config = { version: 1, baseURL: '', accountIDs: [], demo: true, refreshMinutes: 20, staleMinutes: 60 }
export const CACHE_VERSION = 1
export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
export function nonnegative(value: unknown): number | null {
  const n = finite(value); return n !== null && n >= 0 ? n : null
}
export function barPercent(value: unknown): number | null {
  const n = nonnegative(value); return n === null ? null : Math.min(n, 100)
}
export function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = Date.parse(value); return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}
export function safeText(value: unknown, fallback: string, max = 50): string {
  return typeof value === 'string' && value.trim() ? value.replace(/[\r\n\t]/g, ' ').slice(0, max) : fallback
}
export function parseIDs(value: string): number[] {
  const parts = value.trim().split(/[,，\s]+/).filter(Boolean)
  if (!parts.length) throw new Error('请填写至少一个账号 ID')
  if (parts.some(x => !/^[1-9]\d*$/.test(x) || !Number.isSafeInteger(Number(x)))) throw new Error('账号 ID 必须是正整数，用逗号分隔')
  const unique=[...new Set(parts.map(Number))]; if(unique.length>12)throw new Error('最多配置 12 个账号'); return unique
}
export function normalizeBaseURL(value: string): string {
  const input=value.trim()
  if(!/^https:\/\//i.test(input))throw new Error('为保护管理凭证，仅支持完整 HTTPS 地址')
  if(/[\s\x00-\x1f\x7f\\@?#]/.test(input))throw new Error('地址不可包含凭证、空格、反斜杠、查询参数或片段')
  const match=/^https:\/\/([^/]+)(\/.*)?$/i.exec(input)
  if(!match)throw new Error('请输入完整 HTTPS 服务器地址')
  const authority=match[1],path=match[2]||''
  let host='',port=''
  if(authority.startsWith('[')){
    const parts=/^(\[[0-9a-fA-F:.]+\])(?::([0-9]+))?$/.exec(authority)
    if(!parts||!parts[1].includes(':'))throw new Error('IPv6 地址无效')
    host=parts[1].toLowerCase();port=parts[2]||''
  }else{
    const parts=/^([a-zA-Z0-9.-]+)(?::([0-9]+))?$/.exec(authority)
    if(!parts||parts[1].split('.').some(label=>!label||label.length>63||! /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)))throw new Error('服务器域名或端口无效')
    host=parts[1].toLowerCase();port=parts[2]||''
  }
  if(port&&(!Number.isSafeInteger(Number(port))||Number(port)<1||Number(port)>65535))throw new Error('服务器端口无效')
  if(/%(?![0-9a-fA-F]{2})/.test(path)||/%(?:2e|2f|5c|40|00)/i.test(path)||path.split('/').some(p=>p==='.'||p==='..'))throw new Error('部署路径含不安全或不明确的编码')
  return 'https://'+host+(port&&Number(port)!==443?':'+Number(port):'')+path.replace(/\/+$/,'').replace(/\/api\/v1$/,'')
}
export function isStale(at: string | null, minutes: number, now = Date.now()): boolean {
  if (!at) return true
  const elapsed = now - Date.parse(at)
  return !Number.isFinite(elapsed) || elapsed < -300_000 || elapsed > minutes * 60_000
}
export function money(n: number | null): string { return n === null ? '—' : '$' + n.toFixed(n < 10 ? 2 : 1) }
export function compact(n: number | null): string {
  if (n === null) return '—'
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n))
}
export function relativeReset(at: string | null, now = Date.now()): string {
  if (!at) return '重置时间未知'
  const delta = Date.parse(at) - now
  if (!Number.isFinite(delta)) return '重置时间未知'
  if (delta <= 0) return '待更新快照'
  const minutes = Math.ceil(delta / 60_000)
  return minutes >= 1440 ? `${Math.floor(minutes / 1440)}天${Math.floor(minutes % 1440 / 60)}时后` : minutes >= 60 ? `${Math.floor(minutes / 60)}时${minutes % 60}分后` : `${minutes}分后`
}
export function brand(provider: Provider): { name: string; light: string; dark: string } {
  return provider === 'openai' ? { name: 'GPT', light: '#418576', dark: '#83B7A6' } : provider === 'anthropic' ? { name: 'Claude', light: '#AC7353', dark: '#D8A080' } : provider === 'antigravity' ? { name: 'Antigravity', light: '#767EB0', dark: '#A5ADE0' } : { name: '其他', light: '#73808C', dark: '#A6B1BC' }
}
/** Unknown denominators stay unknown; billing cost is not subscription quota. */
export function estimatedRemaining(window: Window): string {
  if (window.percent === null) return '额度未提供'
  return `估算剩余 ${Math.max(0, 100 - window.percent).toFixed(0)}%`
}

type Dict = Record<string, unknown>
function record(value: unknown): Dict { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Dict : {} }
function resetFrom(extra: Dict, absolute: string, relative: string, sampled: string | null): string | null {
  const direct = iso(extra[absolute]); if (direct) return direct
  const seconds = nonnegative(extra[relative]); if (seconds === null || !sampled) return null; const date = new Date(Date.parse(sampled) + seconds * 1000); return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
function windowLabel(value: unknown, fallback: string): string { const n = nonnegative(value); if (n === null || n === 0) return fallback; return n % 1440 === 0 ? `${n/1440}d` : n % 60 === 0 ? `${n/60}h` : `${n}m` }
function fraction(value: unknown): number | null { const n = nonnegative(value); return n === null ? null : nonnegative(n * 100) }
function unix(value: unknown): string | null { const n = nonnegative(value); if (n === null) return null; const date = new Date(n * 1000); return Number.isFinite(date.getTime()) ? date.toISOString() : null }
export function normalizeAccount(raw: unknown, stats: unknown, groupNames: Record<string,string>, now = Date.now()): AccountView {
  const a = record(raw), e = record(a.extra), s = record(stats)
  const provider: Provider = a.platform === 'openai' || a.platform === 'anthropic' || a.platform === 'antigravity' ? a.platform : 'other'
  const sampled = iso(e[provider === 'openai' ? 'codex_usage_updated_at' : 'passive_usage_sampled_at'])
  const windows: Window[] = provider === 'openai' ? [
    { label: windowLabel(e.codex_5h_window_minutes,'5h'), percent: nonnegative(e.codex_5h_used_percent), resetsAt: resetFrom(e,'codex_5h_reset_at','codex_5h_reset_after_seconds',sampled), updatedAt: sampled },
    { label: windowLabel(e.codex_7d_window_minutes,'7d'), percent: nonnegative(e.codex_7d_used_percent), resetsAt: resetFrom(e,'codex_7d_reset_at','codex_7d_reset_after_seconds',sampled), updatedAt: sampled }
  ] : provider === 'anthropic' ? [
    { label: '5h', percent: fraction(e.session_window_utilization), resetsAt: iso(a.session_window_end), updatedAt: sampled },
    { label: '7d', percent: fraction(e.passive_usage_7d_utilization), resetsAt: unix(e.passive_usage_7d_reset), updatedAt: sampled }
  ] : []
  return {
    id: nonnegative(a.id) ?? 0, name: safeText(a.name, '未命名账号', 40), provider,
    groups: Array.isArray(a.group_ids) ? a.group_ids.filter(x => Number.isSafeInteger(x)).map(x => groupNames[String(x)] || `分组 #${x}`).slice(0, 3) : [],
    status: safeText(a.status,'未知',20), windows, todayCost: nonnegative(s.cost), todayTokens: nonnegative(s.tokens), todayRequests:nonnegative(s.requests),
    ...(provider==='openai'&&a.parent_account_id==null?{resetCredits:resetCreditView(e,now)}:{}),
    estimate: '剩余比例由原生已用百分比估算；绝对额度未提供', fetchedAt: new Date(now).toISOString()
  }
}
export function validateConfig(value: unknown): Config {
  const v = record(value)
  if (v.version !== 1) return { ...DEFAULT_CONFIG }
  if (v.demo === true) return { ...DEFAULT_CONFIG }
  const baseURL = normalizeBaseURL(String(v.baseURL || ''))
  const accountIDs = parseIDs(Array.isArray(v.accountIDs) ? v.accountIDs.join(',') : '')
  return {version:1,baseURL,accountIDs,demo:false,refreshMinutes:20,staleMinutes:60,revision:typeof v.revision==='string'?v.revision:'0',referenceCaps:parseReferenceCaps(JSON.stringify(v.referenceCaps || {}))}
}
export function makeDemo(now = Date.now()): AccountView[] {
  const sample = new Date(now - 5 * 60_000).toISOString()
  return [
    {id:101,name:'工作 · GPT Pro',platform:'openai',group_ids:[1],status:'active',extra:{codex_reset_credit_snapshot:{available_count:2,credits:[{expires_at:new Date(now+5*86400_000).toISOString()},{expires_at:new Date(now+9*86400_000).toISOString()}]},codex_auto_reset_credit_state:{status:'available',checked_at:sample},codex_5h_used_percent:37,codex_7d_used_percent:62,codex_5h_reset_at:new Date(now+118*60_000).toISOString(),codex_7d_reset_at:new Date(now+3*86400_000).toISOString(),codex_usage_updated_at:sample}},
    {id:102,name:'日常 · Claude Max',platform:'anthropic',group_ids:[2],status:'active',session_window_end:new Date(now+74*60_000).toISOString(),extra:{session_window_utilization:.71,passive_usage_7d_utilization:.43,passive_usage_7d_reset:(now+2*86400_000)/1000,passive_usage_sampled_at:sample}},
    {id:103,name:'实验 · Antigravity',platform:'antigravity',group_ids:[3],status:'active',extra:{}},
    {id:104,name:'备用 · GPT',platform:'openai',group_ids:[1],status:'active',extra:{codex_5h_used_percent:12,codex_7d_used_percent:25,codex_5h_reset_at:new Date(now+202*60_000).toISOString(),codex_7d_reset_at:new Date(now+5*86400_000).toISOString(),codex_usage_updated_at:sample}}
  ].map((a,i)=>normalizeAccount(a,{cost:[1.82,3.46,.58,.19][i],tokens:[182400,341200,64000,21400][i],requests:[84,127,42,11][i]},{'1':'开发','2':'写作','3':'研究'},now))
}

export function parseReferenceCaps(text: string): Record<string,{fiveHour?:number;sevenDay?:number}> {
  let parsed: unknown; try { parsed = JSON.parse(text.trim() || '{}') } catch { throw new Error('参考额度须为有效 JSON') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('参考额度须为 JSON 对象')
  const source = record(parsed), result: Record<string,{fiveHour?:number;sevenDay?:number}> = {}
  for (const [id, values] of Object.entries(source)) {
    if (!/^[1-9]\d*$/.test(id)) throw new Error('参考额度的键必须为账号 ID')
    if(!values || typeof values!=='object' || Array.isArray(values))throw new Error('每个账号的参考额度须为对象')
    const caps = record(values);if(Object.keys(caps).some(key=>!['fiveHour','sevenDay'].includes(key)))throw new Error('参考额度仅支持 fiveHour / sevenDay')
    const out: {fiveHour?:number;sevenDay?:number} = {}
    for (const key of ['fiveHour','sevenDay'] as const) if (caps[key] !== undefined) {
      const n = nonnegative(caps[key]); if (n === null || n === 0) throw new Error('参考额度必须大于零'); out[key] = n
    }
    result[id] = out
  }
  return result
}
export function referenceRemaining(window: Window, cap: number | undefined): string | null {
  if (cap === undefined || window.percent === null) return null
  return `参考余 ${money(cap * Math.max(0,1-window.percent/100))}`
}

export function validateCachedAccount(value:unknown):AccountView|null {
  const a=record(value)
  if(!Number.isSafeInteger(a.id)||Number(a.id)<=0||!['openai','anthropic','antigravity','other'].includes(String(a.provider))||!Array.isArray(a.windows)||!Array.isArray(a.groups))return null
  const windows:Window[]=[]
  for(const entry of a.windows.slice(0,3)){const w=record(entry);if(typeof w.label!=='string'||(w.percent!==null&&nonnegative(w.percent)===null))return null;windows.push({label:safeText(w.label,'?',10),percent:nonnegative(w.percent),resetsAt:iso(w.resetsAt),updatedAt:iso(w.updatedAt)})}
  return {id:Number(a.id),name:safeText(a.name,'未命名账号',40),provider:a.provider as Provider,groups:a.groups.map(x=>safeText(x,'',30)).filter(Boolean).slice(0,3),status:safeText(a.status,'未知',20),windows,todayCost:nonnegative(a.todayCost),todayTokens:nonnegative(a.todayTokens),todayRequests:nonnegative(a.todayRequests),...(a.provider==='openai'&&a.resetCredits?{resetCredits:{available:nonnegative(record(a.resetCredits).available),expiresAt:iso(record(a.resetCredits).expiresAt),automatic:typeof record(a.resetCredits).automatic==='boolean'?record(a.resetCredits).automatic as boolean:null,state:typeof record(a.resetCredits).state==='string'?safeText(record(a.resetCredits).state,'',10):null,stateAt:iso(record(a.resetCredits).stateAt)}}:{}),estimate:safeText(a.estimate,'额度未提供'),fetchedAt:iso(a.fetchedAt)||'',...(typeof a.error==='string'?{error:safeText(a.error,'连接失败')}:{} )}
}

export type Layout = 'small' | 'mediumOne' | 'mediumTwo' | 'largeOne' | 'largeTwo' | 'largeRows'
export function selectWidgetIDs(config:Config, parameter:string|undefined, family:string):number[] {
  const limit=family==='systemSmall'?1:family==='systemLarge'?4:2
  const allowed=config.demo?[101,102,103,104]:config.accountIDs
  if(!parameter?.trim())return allowed.slice(0,limit)
  const requested=parseIDs(parameter)
  if(requested.some(id=>!allowed.includes(id)))throw new Error('参数包含未配置的账号 ID')
  if(requested.length>limit)throw new Error(`此尺寸最多显示 ${limit} 个账号`)
  return requested
}
export function widgetLayout(family:string,count:number):Layout {
  if(family==='systemSmall')return 'small'
  if(family==='systemLarge')return count===1?'largeOne':count===2?'largeTwo':'largeRows'
  return count===1?'mediumOne':'mediumTwo'
}

function resetCreditView(extra:Record<string,unknown>,now:number) {
  const snapshot=record(extra.codex_reset_credit_snapshot),state=record(extra.codex_auto_reset_credit_state)
  const declared=nonnegative(snapshot.available_count)
  const expiries=Array.isArray(snapshot.credits)?snapshot.credits.map(x=>iso(record(x).expires_at)).filter((x):x is string=>!!x&&Date.parse(x)>now).sort():[]
  const available=declared===0?0:declared!==null&&expiries.length?Math.min(Math.floor(declared),expiries.length):null
  const labels:Record<string,string>={checking:'检查中',available:'可用',resetting:'处理中',success:'已成功',no_credit:'无额度',failed:'失败'}
  return {available,expiresAt:expiries[0]||null,automatic:typeof extra.auto_reset_credit_enabled==='boolean'?extra.auto_reset_credit_enabled:null,state:labels[String(state.status)]||null,stateAt:iso(state.last_result_at)||iso(state.checked_at)}
}
