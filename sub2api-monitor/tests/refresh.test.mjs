import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'sub2api-refresh-'))
for(const file of ['model.ts','client.ts','state.ts','refresh.ts'])await writeFile(join(dir,file),(await readFile(new URL('../'+file,import.meta.url),'utf8')).replace(/from '(\.\/[^']+)'/g,"from '$1.ts'"))
const {refreshMonitor}=await import(pathToFileURL(join(dir,'refresh.ts'))),s=await import(pathToFileURL(join(dir,'state.ts'))),m=await import(pathToFileURL(join(dir,'model.ts')))
test.after(()=>rm(dir,{recursive:true,force:true}))
function fixture(){
 let config=m.validateConfig({version:1,demo:false,baseURL:'https://example.org',revision:'r1',accountIDs:[101,102]})
 let credential=JSON.stringify({baseURL:config.baseURL,revision:config.revision,kind:'apiKey',token:'fixture-only'})
 const data=new Map([[s.CONFIG_KEY,config]]),calls=[]
 globalThis.Storage={get:k=>data.get(k),set:(k,v)=>{data.set(k,v);return true}}
 globalThis.Keychain={get:()=>credential}
 const accounts=m.makeDemo().slice(0,2);s.saveCache(config,accounts,new Date().toISOString())
 const request={identity:s.identity(config),accountIDs:[101]}
 const fetcher=async(url,init)=>{calls.push({url,init});assert.equal(init.method,'GET');assert.equal(await init.handleRedirect(),null);assert.ok(!/reset|\/quota|\/accounts\/\d+\/usage|refresh-token/.test(url));return {ok:true,status:200,json:async()=>({code:0,data:url.includes('/accounts/')?{id:101,name:'fresh',platform:'openai',status:'active',extra:{}}:{total_account_cost:2}})}}
 return {config,data,accounts,calls,request,fetcher,changeAuth:value=>{credential=value}}
}
test('manual refresh bypasses fresh cache, only reads selected account and preserves others',async()=>{
 const f=fixture();await refreshMonitor(f.request,f.fetcher);assert.ok(f.calls.length>=2);assert.ok(f.calls.every(x=>!x.url.includes('accounts/102')));const cache=s.readCache(f.config);assert.equal(cache.accounts.find(a=>a.id===101).name,'fresh');assert.deepEqual(cache.accounts.find(a=>a.id===102),f.accounts[1]);assert.equal(cache.accounts.find(a=>a.id===101).todayCost,2)
})
test('demo and invalid/stale/tampered selections never read keychain or network',async()=>{
 const f=fixture();globalThis.Keychain={get:()=>{throw Error('must not read')}}
 for(const patch of [null,{}, {...f.request,identity:'wrong'}, {...f.request,accountIDs:[]},{...f.request,accountIDs:[999]}, {...f.request,accountIDs:[101,101]}, {...f.request,accountIDs:['101']},{...f.request,accountIDs:[101,102,103,104,105]}])await refreshMonitor(patch,f.fetcher)
 f.data.set(s.CONFIG_KEY,{...f.config,demo:true});await refreshMonitor(f.request,f.fetcher);assert.equal(f.calls.length,0)
})
test('unavailable or mismatched credentials retain snapshot and do not fetch',async()=>{
 const f=fixture(),before=f.data.get(s.CACHE_KEY)
 for(const value of [null,'bad',JSON.stringify({kind:'apiKey',token:'fixture',baseURL:'https://other.invalid'}),JSON.stringify({kind:'jwt',token:123,baseURL:f.config.baseURL,revision:f.config.revision})]){f.changeAuth(value);await refreshMonitor(f.request,f.fetcher)}
 assert.equal(f.calls.length,0);assert.equal(f.data.get(s.CACHE_KEY),before)
})
test('failed request preserves actual successful read time and marks account error',async()=>{
 const f=fixture();await refreshMonitor(f.request,async()=>{throw Error('fixture network failure')});const a=s.readCache(f.config).accounts.find(a=>a.id===101);assert.equal(a.fetchedAt,f.accounts[0].fetchedAt);assert.ok(a.error)
})
test('credentials or configuration changed during refresh discard result',async()=>{
 for(const change of ['auth','config']){const f=fixture(),before=f.data.get(s.CACHE_KEY);await refreshMonitor(f.request,async(...args)=>{if(change==='auth')f.changeAuth(null);else f.data.set(s.CONFIG_KEY,{...f.config,revision:'new'});return f.fetcher(...args)});assert.equal(f.data.get(s.CACHE_KEY),before)}
})
test('repeated concurrent taps share host guard; later intentional tap still works',async()=>{
 const f=fixture();let release;const wait=new Promise(r=>{release=r});const first=refreshMonitor(f.request,async(...args)=>{await wait;return f.fetcher(...args)});await refreshMonitor(f.request,f.fetcher);assert.equal(f.calls.length,0);release();await first;const n=f.calls.length;await refreshMonitor(f.request,f.fetcher);assert.ok(f.calls.length>n)
})
test('App Intent awaits passive refresh then requests reload even when refresh fails',async()=>{
 const source=await readFile(new URL('../app_intents.tsx',import.meta.url),'utf8');assert.match(source,/await refreshMonitor\(selection,fetch\)/);assert.match(source,/finally \{ Widget.reloadAll\(\) \}/);assert.ok(!/operations|reset-panel|action:/.test(source));assert.ok(source.includes('AppIntentProtocol.AppIntent'))
})
