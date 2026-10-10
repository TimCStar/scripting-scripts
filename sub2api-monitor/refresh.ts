import { loadAccounts, type Auth, type FetchLike } from './client'
import { readConfig, readCache, commitCache, AUTH_KEY, identity } from './state'
import type { AccountView } from './model'
export type RefreshSelection = {accountIDs:number[];identity:string}
export type RefreshOutcome = {status:'ok'|'partial'|'failed'|'ignored'|'discarded';notice:string;accounts?:AccountView[]}
const pending=new Map<string,{credential:string;work:Promise<RefreshOutcome>}>()
/** Every timeline execution and button action revalidates passive Sub2API reads.
 * Cache is an offline fallback, never a reason to skip the server. Matching rapid
 * taps await the SAME operation; different widget selections are not dropped.
 * Storage has no cross-process transaction/flush API, so a reloaded widget also
 * reads the server rather than depending on the intent's asynchronous cache write.
 */
export function refreshMonitor(selection:RefreshSelection,fetcher:FetchLike):Promise<RefreshOutcome> {
  const config=readConfig(),key=identity(config)
  if(config.demo)return Promise.resolve({status:'ignored',notice:''})
  if(!selection||selection.identity!==key||!Array.isArray(selection.accountIDs)||!selection.accountIDs.length||selection.accountIDs.length>4||new Set(selection.accountIDs).size!==selection.accountIDs.length||selection.accountIDs.some(id=>!Number.isSafeInteger(id)||!config.accountIDs.includes(id)))return Promise.resolve({status:'ignored',notice:'配置已改变，请重新载入小组件'})
  let saved:string|null
  try{saved=Keychain.get(AUTH_KEY)}catch{return Promise.resolve({status:'failed',notice:'无法读取凭证或服务器'})}
  if(!saved)return Promise.resolve({status:'failed',notice:'请打开脚本配置管理凭证'})
  const pendingKey=key+'|'+selection.accountIDs.join(',')
  const existing=pending.get(pendingKey)
  if(existing?.credential===saved)return existing.work
  const work=(async():Promise<RefreshOutcome>=>{
    try {
      let auth:Auth & {baseURL:string;revision?:string}
      try{auth=JSON.parse(saved)}catch{return {status:'failed',notice:'请重新保存管理凭证'}}
      if(!auth||auth.baseURL!==config.baseURL||auth.revision!==config.revision||typeof auth.token!=='string'||!auth.token||!['apiKey','jwt'].includes(auth.kind))return {status:'failed',notice:'请重新保存管理凭证'}
      const cache=readCache(config)
      const result=await loadAccounts({...config,accountIDs:selection.accountIDs},auth,fetcher,cache?.accounts||[])
      // A credential/config change invalidates the entire in-flight result.
      if(identity(readConfig())!==key||Keychain.get(AUTH_KEY)!==saved)return {status:'discarded',notice:'配置已改变，请重新载入小组件'}
      const committed=commitCache(config,result.accounts,result.fetchedAt)
      const accounts=selection.accountIDs.map(id=>committed.accounts.find(a=>a.id===id)).filter((a):a is AccountView=>!!a)
      const failed=Object.keys(result.errors).length
      return {status:!committed.saved||failed===selection.accountIDs.length?'failed':failed?'partial':'ok',notice:!committed.saved?'缓存保存失败':failed?'连接异常 · 显示缓存':'',accounts}
    }catch{return {status:'failed',notice:'无法读取凭证或服务器'}}
  })()
  pending.set(pendingKey,{credential:saved,work})
  // No ignored rejection from finally; the work itself returns safe outcomes.
  void work.then(()=>{if(pending.get(pendingKey)?.work===work)pending.delete(pendingKey)})
  return work
}
