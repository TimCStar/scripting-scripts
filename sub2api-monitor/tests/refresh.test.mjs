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
 const f=fixture();let release;const wait=new Promise(r=>{release=r});const first=refreshMonitor(f.request,async(...args)=>{await wait;return f.fetcher(...args)});const second=refreshMonitor(f.request,f.fetcher);assert.equal(first,second);assert.equal(f.calls.length,0);release();await Promise.all([first,second]);const n=f.calls.length;await refreshMonitor(f.request,f.fetcher);assert.ok(f.calls.length>n)
})
test('App Intent awaits passive refresh then requests reload even when refresh fails',async()=>{
 const source=await readFile(new URL('../app_intents.tsx',import.meta.url),'utf8');assert.match(source,/await refreshMonitor\(selection,fetch\)/);assert.match(source,/finally \{ Widget.reloadAll\(\) \}/);assert.ok(!/operations|reset-panel|action:/.test(source));assert.ok(source.includes('AppIntentProtocol.AppIntent'))
})

test('cache write failure is an explicit failed outcome with usable in-memory server data',async()=>{
 const f=fixture(),before=f.data.get(s.CACHE_KEY)
 globalThis.Storage.set=()=>false
 const result=await refreshMonitor(f.request,f.fetcher)
 assert.equal(result.status,'failed');assert.equal(result.notice,'缓存保存失败')
 assert.equal(result.accounts.find(a=>a.id===101).name,'fresh');assert.equal(f.data.get(s.CACHE_KEY),before)
})
test('a different visible-account selection is not lost behind a running refresh',async()=>{
 const f=fixture();let release;const wait=new Promise(r=>{release=r})
 const first=refreshMonitor(f.request,async(...args)=>{await wait;return f.fetcher(...args)})
 const second=await refreshMonitor({...f.request,accountIDs:[102]},async(url,init)=>{
  const response=await f.fetcher(url,init)
  return url.includes('/accounts/')?{...response,json:async()=>({code:0,data:{id:102,name:'second',platform:'other',status:'active',extra:{}}})}:response
 })
 assert.equal(second.status,'ok');assert.equal(second.accounts[0].name,'second');release();await first
 assert.equal(s.readCache(f.config).accounts.find(a=>a.id===102).name,'second')
})
test('reload in a separate host rereads changed server values despite fresh but unflushed Storage',async()=>{
 const f=fixture(),persisted=new Map(structuredClone([...f.data])),writes=[]
 // Intent host sees its accepted writes; the new widget host still sees old disk.
 globalThis.Storage={get:k=>f.data.get(k),set:(k,v)=>{f.data.set(k,v);writes.push([k,v]);return true}}
 const intent=await refreshMonitor(f.request,f.fetcher);assert.equal(intent.status,'ok')
 assert.equal(persisted.get(s.CACHE_KEY).accounts[0].name,f.accounts[0].name)
 globalThis.Storage={get:k=>persisted.get(k),set:(k,v)=>{persisted.set(k,v);return true}}
 const snapshot='2026-10-10T01:02:03Z'
 const reloaded=await refreshMonitor(f.request,async(url,init)=>{
  const response=await f.fetcher(url,init)
  return url.includes('/accounts/')?{...response,json:async()=>({code:0,data:{id:101,name:'server changed again',platform:'openai',status:'active',extra:{codex_7d_used_percent:84,codex_usage_updated_at:snapshot}}})}:response
 })
 assert.equal(reloaded.status,'ok');assert.equal(reloaded.accounts[0].name,'server changed again')
 assert.equal(reloaded.accounts[0].windows[0].percent,84)
 assert.equal(reloaded.accounts[0].windows[0].updatedAt,new Date(snapshot).toISOString())
 assert.ok(writes.length);assert.equal(s.readCache(f.config).accounts[0].name,'server changed again')
 // Every network request revalidates HTTP cache; nocache stats keep local-DB scope.
 for(const call of f.calls){assert.match(call.init.headers['Cache-Control'],/no-cache/);assert.match(call.init.headers['Cache-Control'],/no-store/)}
})
test('out-of-order separate execution hosts cannot replace a newer read with a slow old response',async()=>{
 const f=fixture()
 // A fresh module has independent in-flight state, just like the widget host.
 await writeFile(join(dir,'refresh-other.ts'),await readFile(join(dir,'refresh.ts'),'utf8'))
 const other=await import(pathToFileURL(join(dir,'refresh-other.ts')))
 let release;const wait=new Promise(r=>{release=r})
 const old=refreshMonitor(f.request,async(url,init)=>{
  if(url.includes('/accounts/'))await wait
  const response=await f.fetcher(url,init)
  return url.includes('/accounts/')?{...response,json:async()=>({code:0,data:{id:101,name:'older response',platform:'other',status:'active',extra:{}}})}:response
 })
 await new Promise(r=>setTimeout(r,8))
 const newer=await other.refreshMonitor(f.request,f.fetcher)
 assert.equal(newer.accounts[0].name,'fresh')
 release();const older=await old
 assert.equal(older.accounts[0].name,'fresh');assert.equal(s.readCache(f.config).accounts.find(a=>a.id===101).name,'fresh')
})
test('network failure and missing credentials report failure without claiming a new successful read',async()=>{
 const f=fixture(),before=f.accounts[0].fetchedAt
 const offline=await refreshMonitor(f.request,async()=>{throw Error('DO_NOT_EXPOSE_TOKEN')})
 assert.equal(offline.status,'failed');assert.equal(offline.accounts[0].fetchedAt,before)
 assert.ok(!JSON.stringify(offline).includes('DO_NOT_EXPOSE_TOKEN'))
 f.changeAuth(null);const noAuth=await refreshMonitor(f.request,f.fetcher)
 assert.equal(noAuth.status,'failed');assert.match(noAuth.notice,/凭证/);assert.equal(f.calls.length,0)
})

test('a credential change cannot join the old in-flight operation',async()=>{
 const f=fixture();let release;const wait=new Promise(r=>{release=r})
 const old=refreshMonitor(f.request,async(...args)=>{await wait;return f.fetcher(...args)})
 f.changeAuth(JSON.stringify({baseURL:f.config.baseURL,revision:f.config.revision,kind:'apiKey',token:'replacement-fixture'}))
 const current=await refreshMonitor(f.request,async(url,init)=>{assert.equal(init.headers['x-api-key'],'replacement-fixture');return f.fetcher(url,init)})
 assert.equal(current.status,'ok');release();assert.equal((await old).status,'discarded')
 assert.equal(s.readCache(f.config).accounts[0].name,'fresh')
})

test('cached failure placeholder followed by missing credentials is still no data, never an old snapshot',async()=>{
 const f=fixture();f.data.delete(s.CACHE_KEY)
 const first=await refreshMonitor(f.request,async()=>{throw Error('offline')})
 assert.equal(first.status,'failed');assert.equal(first.accounts[0].fetchedAt,'')
 assert.match(first.notice,/暂无可用数据/);assert.ok(!first.notice.includes('旧快照'))
 f.changeAuth(null)
 const second=await refreshMonitor(f.request,f.fetcher)
 assert.equal(second.status,'failed');assert.match(second.notice,/暂无可用数据/)
 assert.ok(!second.notice.includes('旧快照'));assert.equal(second.accounts[0].fetchedAt,'')
 assert.equal(f.calls.length,0)
})

test('stats-only request failure produces partial outcome and recovery clears persisted diagnostics',async()=>{
 const f=fixture()
 const partial=await refreshMonitor(f.request,async(url,init)=>url.includes('/usage/stats')?{ok:false,status:503,json:async()=>({error:'NEVER_EXPOSE'})}:f.fetcher(url,init))
 assert.equal(partial.status,'partial');assert.match(partial.notice,/部分请求失败/)
 assert.ok(!partial.notice.includes('旧快照'))
 assert.equal(partial.accounts[0].error,undefined)
 assert.ok(partial.accounts[0].requestErrors.some(reason=>reason.includes('服务器暂不可用（503）')))
 assert.ok(!JSON.stringify(partial).includes('NEVER_EXPOSE'))
 const recovered=await refreshMonitor(f.request,f.fetcher)
 assert.equal(recovered.status,'ok');assert.equal(recovered.notice,'')
 assert.equal(recovered.accounts[0].error,undefined)
 assert.deepEqual(recovered.accounts[0].requestErrors??[],[])
 assert.deepEqual(s.readCache(f.config).accounts.find(a=>a.id===101).requestErrors??[],[])
})
