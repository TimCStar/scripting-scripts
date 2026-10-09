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
export function saveCache(config:Config,accounts:AccountView[],fetchedAt:string):boolean {
  // Only normalized, whitelisted AccountView objects enter Storage. Never store raw API responses.
  try { return Storage.set(CACHE_KEY,{version:CACHE_VERSION,identity:identity(config),accounts:accounts.map(validateCachedAccount).filter(Boolean),fetchedAt}) } catch { return false }
}
