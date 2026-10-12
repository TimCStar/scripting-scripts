import { safeText, money, validWeeklySample, validToday, sevenDayCostStart, nonnegative, type AccountView, type Window, type Config } from './model'
/** Device-only aliases, never sent to Sub2API or used as account identifiers. */
export function parseDisplayNames(text:string):Record<string,string> {
  let source:unknown
  try{source=JSON.parse(text.trim()||'{}')}catch{throw new Error('显示名称须为有效 JSON')}
  if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('显示名称须为 JSON 对象')
  const result:Record<string,string>={}
  for(const [id,name] of Object.entries(source)){
    if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id)))throw new Error('显示名称的键必须为账号 ID')
    if(typeof name!=='string'||!name.trim())throw new Error('每个显示名称须为非空文字')
    if(name.trim().length>40)throw new Error('显示名称最多 40 个字符')
    result[id]=safeText(name.trim(),'账号',40)
  }
  return result
}
export function displayName(account:AccountView,names?:Record<string,string>):string {
  return safeText(names?.[String(account.id)],account.name,40)
}
/** A missing amount is unknown, never 0 or a manually supplied quota. */
export function usageDollars(used:number|null|undefined,total:number|null|undefined):string {
  return `${money(used??null)} / ${total==null?'—':money(total)}`
}

export function visibleWindows(account:AccountView,config:Config):Window[] {
 const choice=config.fiveHourVisibility?.[String(account.id)]||'auto'
 if(choice==='hide')return account.windows.filter(w=>w.label!=='5h')
 if(choice==='show'&&!account.windows.some(w=>w.label==='5h')&&(account.provider==='openai'||account.provider==='anthropic'))return [{label:'5h',percent:null,resetsAt:null,updatedAt:null},...account.windows]
 return account.windows
}

export function windowDollars(window:Window,config:Config,now=Date.now()):string {
 if(window.costStatus!=='complete'||sevenDayCostStart(window,now)===null)return usageDollars(null,null)
 return usageDollars(window.usedUSD,validWeeklySample(window,now)?window.estimatedTotalUSD:null)
}

/** Compact absolute timestamp in device local time, shared by reset and update labels. */
export function resetTime(at:string|null|undefined):string {
  if(!at)return '—'
  const date=new Date(at)
  if(!Number.isFinite(date.getTime()))return '—'
  const pad=(n:number)=>String(n).padStart(2,'0')
  return `${date.getMonth()+1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Render-time remaining duration. Never roll an expired snapshot into a new window.
 * Floor complete units; under one minute stays explicit rather than showing zero. */
export function countdown(at:string|null|undefined,now=Date.now()):string {
  const end=at?Date.parse(at):NaN
  if(!Number.isFinite(end)||!Number.isFinite(now))return '—'
  const remaining=end-now
  if(remaining<=0)return '0m'
  const minutes=Math.floor(remaining/60_000)
  if(minutes<1)return '<1m'
  const hours=Math.floor(minutes/60),days=Math.floor(hours/24)
  return days>0?`${days}d${hours%24}h`:hours>0?`${hours}h${minutes%60}m`:`${minutes}m`
}

/** Oldest successful read among the displayed accounts. Global cache write time can
 * advance after failures or updates to other accounts, so it is deliberately unused. */
export function oldestSuccessfulRead(accounts:AccountView[]):string|null {
  if(!accounts.length)return null
  const times=accounts.map(a=>a.fetchedAt?Date.parse(a.fetchedAt):NaN)
  if(times.some(t=>!Number.isFinite(t)))return null
  return new Date(Math.min(...times)).toISOString()
}
export function updateFooter(accounts:AccountView[]):string {
  return `更新于：${resetTime(oldestSuccessfulRead(accounts))}`
}

/** Daily percent is today's local account cost / valid estimated weekly total. */
export function todayUsage(account:AccountView,config:Config,now=Date.now(),timeZone?:string):string {
 const valid=validToday(account,now,timeZone)
 const amount=valid?nonnegative(account.todayCost):null
 const w=account.windows.find(w=>w.label==='7d'),total=w?.estimatedTotalUSD
 const ratio=amount!==null&&w?.costStatus==='complete'&&validWeeklySample(w,now)&&typeof total==='number'&&Number.isFinite(total)&&total>0?amount/total*100:null
 const percent=ratio!==null&&Number.isFinite(ratio)?`${Math.round(ratio*10)/10}%`:'—'
 return `今日用量：${percent} / ${money(amount)}${valid&&(account.todayFallback||account.error||ratio!==null&&w?.costFallback)?' · 旧快照':''}`
}

/** Only a failed read falling back to previously read data is an old snapshot.
 * Sample age remains metadata; expired monetary windows stay independently guarded. */
export function snapshotNote(account:AccountView,window:Window,now=Date.now()):string {
 if(account.error&&account.fetchedAt||window.costFallback)return '旧快照'
 return window.resetsAt&&Date.parse(window.resetsAt)<=now?'待更新':''
}
export function accountRequestStatus(account:AccountView,current=false):string {
 const prefix=current?'本次':'上次'
 if(account.error)return `${prefix}请求失败：${account.error}${account.fetchedAt?' · 旧快照':' · 暂无可用数据'}`
 if(account.requestErrors?.length)return `${prefix}部分请求失败：${account.requestErrors.join('；')}`
 return account.fetchedAt?`${prefix}请求成功`:'尚未请求'
}

/** Detailed reason lives in the existing request panel, without adding widget rows. */
export function amountStatus(account:AccountView,now=Date.now()):string[] {
 const today=validToday(account,now)
 const lines=[`今日金额：${today?(account.todayFallback||account.error?'旧快照':'已读取'):(account.todayIssue==='request'?'请求失败，无有效当日缓存':account.todayIssue==='timezone'?'无法确认本机时区':account.todayIssue==='invalid'?'统计未提供有效金额':'当日数据待更新')} · ${resetTime(account.todayUpdatedAt)}`]
 for(const w of account.windows.filter(w=>w.label==='7d')) {
  const active=sevenDayCostStart(w,now)!==null
  const status=!active?'窗口已过期或边界未知':w.costStatus==='complete'?(w.costFallback||account.error?'旧快照':'已读取'):w.costIssue==='request'?'请求失败，无有效同窗口缓存':w.costStatus==='truncated'?'边界记录超过读取上限':'统计或边界记录不完整'
  const total=!active?'总额未知':!validWeeklySample(w,now)?'比例采样无法确认属于当前窗口':!w.estimatedTotalUSD?'费用或比例为零／缺失，无法估算':'总额为估算值'
  lines.push(`7d 金额：${status} · ${resetTime(w.costUpdatedAt)}；${total}`)
 }
 return lines
}
