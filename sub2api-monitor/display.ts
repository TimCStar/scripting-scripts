import { safeText, money, isStale, type AccountView, type Window, type Config } from './model'
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
