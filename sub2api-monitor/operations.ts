/** App-only Codex reset controller. NEVER imported by widget.tsx. No live request is made by tests. */
import {normalizeAccount,normalizeBaseURL,iso,type AccountView,type Config} from './model'
import {type Auth,type FetchLike} from './client'
export type Receipt={version:1;server:string;accountID:number;accountName:string;operationID:string;startedAt:string;status:'pending'|'unknown'|'succeeded'|'acknowledged';windowsReset?:number;warning?:string;finishedAt?:string}
export type ReceiptStore={read:(key:string)=>Receipt|null;write:(key:string,value:Receipt)=>boolean}
export type ResetAccount={account:AccountView;eligible:boolean;reason:string}
export type ResetPreparation={server:string;accountID:number;accountName:string;revision:string;preparedAt:number;cachedCredits:number|null;expiresAt:string|null}
const inFlight=new Set<string>()
export function receiptKey(server:string,id:number):string{return `sub2api.reset.receipt.v1:${encodeURIComponent(server)}:${id}`}
function validateConnection(config:Config,id:number){if(config.demo)throw new Error('演示模式不允许重置');if(normalizeBaseURL(config.baseURL)!==config.baseURL||!config.accountIDs.includes(id))throw new Error('账号不在已保存配置中')}
async function request(config:Config,auth:Auth,path:string,method:'GET'|'POST',fetcher:FetchLike):Promise<unknown>{
 const headers:Record<string,string>=auth.kind==='jwt'?{Authorization:`Bearer ${auth.token}`}:{'x-api-key':auth.token}
 try {
  const response=await fetcher(`${config.baseURL}/api/v1/admin/${path}`,{method,headers,timeout:method==='POST'?45:12,handleRedirect:async()=>null})
  if(!response.ok)throw new Error()
  const envelope=await response.json() as {code?:number;data?:unknown}
  if(!envelope||envelope.code!==0||!envelope.data)throw new Error()
  return envelope.data
 }catch{throw new Error(method==='GET'?'无法读取账号，请检查权限或连接':'重置请求结果不确定')}

}
export async function inspectResetAccount(config:Config,auth:Auth,id:number,fetcher:FetchLike):Promise<ResetAccount>{
 validateConnection(config,id)
 const raw=await request(config,auth,`accounts/${id}`,'GET',fetcher) as Record<string,unknown>
 if(raw.id!==id)throw new Error('账号身份不匹配')
 const account=normalizeAccount(raw,null,{})
 const eligible=raw.platform==='openai'&&raw.type==='oauth'&&raw.parent_account_id==null
 return {account,eligible,reason:eligible?'缓存不能保证实际有券，最终由服务器判断':'仅支持 OpenAI OAuth 主账号；影子账号和其他平台不支持'}
}
export async function prepareReset(config:Config,auth:Auth,id:number,fetcher:FetchLike,store:ReceiptStore,now=Date.now()):Promise<ResetPreparation>{
 validateConnection(config,id)
 const receipt=store.read(receiptKey(config.baseURL,id))
 if(receipt&&receipt.status!=='acknowledged')throw new Error('已有操作记录，请先核对后台结果，不能重复提交')
 const result=await inspectResetAccount(config,auth,id,fetcher)
 if(!result.eligible)throw new Error(result.reason)
 return {server:config.baseURL,accountID:id,accountName:result.account.name,revision:config.revision||'0',preparedAt:now,cachedCredits:result.account.resetCredits?.available??null,expiresAt:result.account.resetCredits?.expiresAt??null}
}
export async function executeReset(prepared:ResetPreparation,config:Config,auth:Auth,fetcher:FetchLike,store:ReceiptStore,now=Date.now()):Promise<Receipt>{
 validateConnection(config,prepared.accountID)
 if(prepared.server!==config.baseURL||prepared.revision!==(config.revision||'0')||now-prepared.preparedAt>120_000||now<prepared.preparedAt)throw new Error('确认已过期或设置已更改，请重新确认')
 const key=receiptKey(config.baseURL,prepared.accountID)
 if(inFlight.has(key))throw new Error('该账号正在处理，请勿重复点击')
 inFlight.add(key)
 try{
  const prior=store.read(key);if(prior&&prior.status!=='acknowledged')throw new Error('已有操作记录，请先核对后台结果')
  // Recheck identity and type after user confirmation, before any mutation.
  const fresh=await inspectResetAccount(config,auth,prepared.accountID,fetcher)
  if(!fresh.eligible||fresh.account.name!==prepared.accountName)throw new Error('账号信息已变化，请重新核对并确认')
  const pending:Receipt={version:1,server:config.baseURL,accountID:prepared.accountID,accountName:prepared.accountName,operationID:`${now}-${Math.random().toString(36).slice(2)}`,startedAt:new Date(now).toISOString(),status:'pending'}
  if(!store.write(key,pending))throw new Error('无法保存安全操作记录，未发送重置请求')
  const stored=store.read(key);if(stored?.operationID!==pending.operationID||stored.status!=='pending')throw new Error('操作记录校验失败，未发送重置请求')
  let terminal:Receipt
  try{
   // Exactly ONE POST. No retries, body, credit ID, window flags or idempotency assumptions.
   const raw=await request(config,auth,`openai/accounts/${prepared.accountID}/reset-quota`,'POST',fetcher) as Record<string,unknown>
   if(raw.code!=='success'||typeof raw.windows_reset!=='number'||!Number.isFinite(raw.windows_reset)||raw.windows_reset<0)throw new Error('结果不确定')
   const warnings:Record<string,string>={reset_credit_cache_refresh_failed:'额度缓存刷新失败',account_state_recovery_failed:'账号状态恢复失败',account_state_refresh_failed:'账号状态读取失败'}
   terminal={...pending,status:'succeeded',windowsReset:raw.windows_reset,finishedAt:new Date().toISOString(),...(raw.warning_code||raw.cache_refreshed!==true||raw.account_state_recovered!==true?{warning:warnings[String(raw.warning_code)]||'重置已完成，但部分缓存或账号状态未更新'}:{})}
  }catch{terminal={...pending,status:'unknown',finishedAt:new Date().toISOString(),warning:'可能已消耗重置券。请先在后台核对，禁止自动重试。'}}
  let saved=false;try{saved=store.write(key,terminal)}catch{}
  if(!saved)return {...terminal,warning:(terminal.warning?terminal.warning+'；':'')+'操作记录未更新，本机仍保持待核对锁定'}
  return terminal
 }finally{inFlight.delete(key)}
}
export function acknowledgeReceipt(server:string,id:number,store:ReceiptStore):boolean{
 const key=receiptKey(server,id),prior=store.read(key)
 if(!prior||prior.status==='pending'&&inFlight.has(key))return false
 return store.write(key,{...prior,status:'acknowledged'})
}
export function validateReceipt(raw:unknown):Receipt|null{
 if(raw===null)return null
 if(!raw||typeof raw!=='object')throw new Error('操作记录损坏，请勿重置；先核对后台')
 const r=raw as Receipt
 if(r.version!==1||!Number.isSafeInteger(r.accountID)||!r.server||!r.operationID||!iso(r.startedAt)||!['pending','unknown','succeeded','acknowledged'].includes(r.status))throw new Error('操作记录损坏，请勿重置；先核对后台')
 return r
}
