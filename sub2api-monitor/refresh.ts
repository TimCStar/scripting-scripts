import { loadAccounts, type Auth, type FetchLike } from './client'
import { readConfig, readCache, saveCache, AUTH_KEY, identity } from './state'
export type RefreshSelection = {accountIDs:number[];identity:string}
let running=false
/** Force passive local Sub2API reads, even when cache is fresh. Serialized within
 * this execution host; overlapping hosts merge freshest successful account reads. */
export async function refreshMonitor(selection:RefreshSelection,fetcher:FetchLike):Promise<void> {
  if(running)return
  running=true
  try {
    const config=readConfig(),key=identity(config)
    if(config.demo)return
    // Widget parameters are untrusted selectors, never credentials or endpoints.
    if(!selection||selection.identity!==key||!Array.isArray(selection.accountIDs)||!selection.accountIDs.length||selection.accountIDs.length>4||new Set(selection.accountIDs).size!==selection.accountIDs.length||selection.accountIDs.some(id=>!Number.isSafeInteger(id)||!config.accountIDs.includes(id)))return
    const saved=Keychain.get(AUTH_KEY)
    if(!saved)return
    const auth=JSON.parse(saved) as Auth & {baseURL:string;revision?:string}
    if(auth.baseURL!==config.baseURL||auth.revision!==config.revision||typeof auth.token!=='string'||!auth.token||!['apiKey','jwt'].includes(auth.kind))return
    const cache=readCache(config)
    const result=await loadAccounts({...config,accountIDs:selection.accountIDs},auth,fetcher,cache?.accounts||[])
    // A configuration/credential change during fetch must not write old-server data.
    if(identity(readConfig())!==key||Keychain.get(AUTH_KEY)!==saved)return
    const latest=readCache(config)
    const updated=result.accounts.map(a=>{
      const prior=latest?.accounts.find(x=>x.id===a.id)
      return prior&&Date.parse(prior.fetchedAt)>Date.parse(a.fetchedAt||'1970-01-01')?prior:a
    })
    saveCache(config,[...(latest?.accounts||[]).filter(a=>!selection.accountIDs.includes(a.id)),...updated],result.fetchedAt)
  } catch {
    // Keychain unavailable / malformed credentials: retain all existing snapshots.
    // loadAccounts records per-account network errors without exposing raw errors.
  } finally { running=false }
}
