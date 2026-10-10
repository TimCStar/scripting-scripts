import { safeText, money, isStale, localDay, nonnegative, type AccountView, type Window, type Config } from './model'
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
 if(window.costStatus!=='complete'||!window.resetsAt||Date.parse(window.resetsAt)<=now)return usageDollars(null,null)
 return usageDollars(window.usedUSD,isStale(window.updatedAt,config.staleMinutes,now)?null:window.estimatedTotalUSD)
}

/** Compact absolute timestamp in device local time, shared by reset and update labels. */
export function resetTime(at:string|null|undefined):string {
  if(!at)return '—'
  const date=new Date(at)
  if(!Number.isFinite(date.getTime()))return '—'
  const pad=(n:number)=>String(n).padStart(2,'0')
  return `${date.getMonth()+1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Keep the reset label separate so the update footer never gains a reset prefix. */
export function resetLabel(at:string|null|undefined):string {
  return `重置于 ${resetTime(at)}`
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
 const day=localDay(now,timeZone),sample=Date.parse(account.todayUpdatedAt||'')
 const valid=day&&account.todayDate===day.date&&account.todayTimeZone===day.timeZone&&Number.isFinite(sample)&&sample<=now&&localDay(sample,day.timeZone)?.date===day.date&&!isStale(account.todayUpdatedAt!,config.staleMinutes,now)&&!account.error
 const amount=valid?nonnegative(account.todayCost):null
 const w=account.windows.find(w=>w.label==='7d'),total=w?.estimatedTotalUSD
 const ratio=amount!==null&&w?.costStatus==='complete'&&w.resetsAt&&Date.parse(w.resetsAt)>now&&!isStale(w.updatedAt,config.staleMinutes,now)&&typeof total==='number'&&Number.isFinite(total)&&total>0?amount/total*100:null
 const percent=ratio!==null&&Number.isFinite(ratio)?`${Math.round(ratio*10)/10}%`:'—'
 return `今日用量：${percent} / ${money(amount)}`
}
