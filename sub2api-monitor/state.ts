import { DEFAULT_CONFIG, CACHE_VERSION, validateConfig, validateCachedAccount, iso, type Config, type AccountView } from './model'
export const CONFIG_KEY = 'sub2api.config.v1'
export const AUTH_KEY = 'sub2api.admin.v1'
export const CACHE_KEY = 'sub2api.cache.v1'
export type Cache = {version:typeof CACHE_VERSION;identity:string;accounts:AccountView[];fetchedAt:string}
export function readConfig(): Config { try { return validateConfig(Storage.get(CONFIG_KEY)) } catch { return {...DEFAULT_CONFIG} } }
export function identity(config:Config):string { return `${config.baseURL}|${config.revision||'0'}|${config.accountIDs.join(',')}` }
export function readCache(config:Config):Cache|null {
  try { const value = Storage.get<Cache>(CACHE_KEY); if(value?.version !== CACHE_VERSION || value.identity !== identity(config) || !Array.isArray(value.accounts) || !iso(value.fetchedAt))return null;const accounts=value.accounts.map(validateCachedAccount);if(accounts.some(x=>!x))return null;return {...value,accounts:accounts as AccountView[]} } catch { return null }
}
function readOrder(a:AccountView):number{return Date.parse(a.readStartedAt||a.fetchedAt)||0}
/** Merge at commit time, not from a cache captured before the network request.
 * Request start orders slow responses: completion time alone can make an older
 * server response overwrite a newer one. Failed reads retain their prior times.
 * Best effort across hosts: Storage offers neither CAS nor a persistence flush.
 */
export function commitCache(config:Config,updates:AccountView[],fetchedAt:string):{saved:boolean;accounts:AccountView[]} {
  const latest=readCache(config)
  const byID=new Map((latest?.accounts||[]).filter(a=>config.accountIDs.includes(a.id)).map(a=>[a.id,a]))
  for(const item of updates){
    const a=validateCachedAccount(item)
    if(!a||!config.accountIDs.includes(a.id))continue
    const prior=byID.get(a.id)
    if(!prior||readOrder(a)>=readOrder(prior))byID.set(a.id,a)
  }
  const accounts=[...byID.values()]
  try { return {saved:Storage.set(CACHE_KEY,{version:CACHE_VERSION,identity:identity(config),accounts,fetchedAt:iso(fetchedAt)||new Date().toISOString()}),accounts} } catch { return {saved:false,accounts} }
}
export function saveCache(config:Config,accounts:AccountView[],fetchedAt:string):boolean {
  return commitCache(config,accounts,fetchedAt).saved
}
