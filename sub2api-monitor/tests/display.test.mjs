import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'sub2api-display-'))
for(const file of ['model.ts','display.ts','client.ts','state.ts'])await writeFile(join(dir,file),(await readFile(new URL('../'+file,import.meta.url),'utf8')).replace("from './model'","from './model.ts'"))
const d=await import(pathToFileURL(join(dir,'display.ts'))),m=await import(pathToFileURL(join(dir,'model.ts')))
test.after(()=>rm(dir,{recursive:true,force:true}))
const now=Date.parse('2026-10-09T12:00:00Z')
const a={id:1,name:'Server name',provider:'openai',windows:[{label:'7d',percent:10,updatedAt:new Date(now).toISOString(),resetsAt:new Date(now+100000).toISOString(),usedUSD:10,estimatedTotalUSD:100,costStatus:'complete'}]}
test('local custom display names validate and fall back to server name',()=>{assert.equal(d.displayName(a,{'1':'工作'}),'工作');assert.equal(d.displayName(a,{}),'Server name');assert.deepEqual(d.parseDisplayNames('{"1":" 工作 "}'),{'1':'工作'});for(const text of ['[]','null','{"0":"bad"}','{"1":4}','{"1":""}'])assert.throws(()=>d.parseDisplayNames(text))})
test('config persists device names and per-account 5h choices, not old manual caps',()=>{const c=m.validateConfig({version:1,demo:false,baseURL:'https://example.org',accountIDs:[1],displayNames:{1:'工作'},fiveHourVisibility:{1:'hide',2:'bad'},referenceCaps:{1:{sevenDay:999}}});assert.deepEqual(c.displayNames,{'1':'工作'});assert.deepEqual(c.fiveHourVisibility,{'1':'hide'});assert.equal(c.referenceCaps,undefined)})
test('5h auto/hide/show distinguishes missing observation and unknown without changing 7d',()=>{assert.equal(d.visibleWindows(a,m.DEFAULT_CONFIG).length,1);const shown=d.visibleWindows(a,{fiveHourVisibility:{1:'show'}});assert.equal(shown[0].percent,null);assert.equal(shown[0].label,'5h');const observed={...a,windows:[{label:'5h',percent:0},...a.windows]};assert.equal(d.visibleWindows(observed,{}).length,2);assert.equal(d.visibleWindows(observed,{fiveHourVisibility:{1:'hide'}}).length,1);assert.equal(d.visibleWindows({...a,provider:'antigravity'},{fiveHourVisibility:{1:'show'}}).length,1)})
test('weekly dollars display actual used / estimated total without remaining wording',()=>{assert.equal(d.usageDollars(10,100),'$10.0 / $100.0');assert.equal(d.usageDollars(0,null),'$0.00 / —');assert.equal(d.usageDollars(null,null),'— / —')})
test('expired/absent/incomplete amounts hidden; stale ratio keeps used but not estimate',()=>{const w=a.windows[0];assert.equal(d.windowDollars({...w,updatedAt:new Date(now-61*60000).toISOString()},m.DEFAULT_CONFIG,now),'$10.0 / —');assert.equal(d.windowDollars(w,m.DEFAULT_CONFIG,now),'$10.0 / $100.0');for(const patch of [{resetsAt:new Date(now).toISOString()},{costStatus:'truncated'},{costStatus:undefined},{resetsAt:null}])assert.equal(d.windowDollars({...w,...patch},m.DEFAULT_CONFIG,now),'— / —')})
test('widget source omits removed metadata and fake provider symbols',async()=>{const w=await readFile(new URL('../widget.tsx',import.meta.url),'utf8');for(const text of ['SUB2API','a.groups','todayTokens','估算余','参考余','b.name'])assert.ok(!w.includes(text),text);assert.ok(w.includes('<ProviderIcon'));assert.ok(w.includes('windowDollars(w,c,now)'));const form=await readFile(new URL('../index.tsx',import.meta.url),'utf8');assert.ok(!form.includes('JSON 参考值'));assert.ok(form.includes('显示名称（留空使用服务器名称）'))})
test('cache schema reads and writes the exported version; credentials keys unchanged',async()=>{const state=await readFile(new URL('../state.ts',import.meta.url),'utf8');assert.ok(state.includes('value?.version !== CACHE_VERSION'));assert.ok(state.includes('version:CACHE_VERSION,identity'));assert.ok(state.includes("AUTH_KEY = 'sub2api.admin.v1'"));assert.ok(state.includes("CONFIG_KEY = 'sub2api.config.v1'"))})

test('shared absolute timestamp is compact local M/D HH:mm without any label',()=>{const date=new Date(2026,9,16,2,5);assert.equal(d.resetTime(date.toISOString()),'10/16 02:05');for(const at of [null,undefined,'','bad'])assert.equal(d.resetTime(at),'—')})

test('footer uses oldest selected successful read; invalid and empty accounts show unknown',()=>{
 const first={...a,fetchedAt:'2026-10-09T10:01:00Z'},second={...a,id:2,fetchedAt:'2026-10-09T11:02:00Z'}
 assert.equal(d.oldestSuccessfulRead([second,first]),first.fetchedAt.replace('00Z','00.000Z'))
 assert.equal(d.updateFooter([first,second]),`更新于：${d.resetTime(first.fetchedAt)}`)
 assert.equal(d.updateFooter([second]),`更新于：${d.resetTime(second.fetchedAt)}`)
 for(const accounts of [[],[first,{...second,fetchedAt:''}],[{...first,fetchedAt:'bad'}]])assert.equal(d.updateFooter(accounts),'更新于：—')
})
test('cache roundtrip and all-failed/mixed reads never freshen retained account timestamp',async()=>{
 const {loadAccounts}=await import(pathToFileURL(join(dir,'client.ts')))
 const state=await import(pathToFileURL(join(dir,'state.ts')))
 const c={...m.DEFAULT_CONFIG,demo:false,baseURL:'https://example.org',accountIDs:[1,2]},old='2026-10-08T10:00:00Z'
 const previous=[1,2].map(id=>m.normalizeAccount({id,name:`Demo ${id}`,platform:'openai',extra:{}},null,{},Date.parse(old)))
 let stored;globalThis.Storage={get:()=>stored,set:(_key,value)=>{stored=value;return true}}
 try {
  for(const mixed of [false,true]){
   const result=await loadAccounts(c,{kind:'apiKey',token:'TEST'},async url=>{
    if(!mixed||url.endsWith('/1'))throw Error('offline')
    return {ok:true,status:200,json:async()=>({code:0,data:{id:2,platform:'openai',extra:{}}})}
   },previous)
   assert.equal(result.accounts[0].fetchedAt,previous[0].fetchedAt)
   assert.equal(d.oldestSuccessfulRead(result.accounts),previous[0].fetchedAt)
   assert.notEqual(result.fetchedAt,previous[0].fetchedAt)
   assert.equal(state.saveCache(c,result.accounts,result.fetchedAt),true)
   const cached=state.readCache(c)
   assert.equal(d.updateFooter(cached.accounts),`更新于：${d.resetTime(old)}`)
   if(mixed)assert.notEqual(d.oldestSuccessfulRead([cached.accounts[1]]),previous[1].fetchedAt)
  }
 } finally {delete globalThis.Storage}
})

test('countdown has bounded English units, explicit unknowns and no automatic rollover',()=>{
 const at=ms=>new Date(now+ms).toISOString()
 for(const v of [null,undefined,'','bad'])assert.equal(d.countdown(v,now),'—')
 for(const [ms,label] of [[-1,'0m'],[0,'0m'],[1,'<1m'],[59999,'<1m'],[60000,'1m'],[3599999,'59m'],[3600000,'1h0m'],[86399999,'23h59m'],[86400000,'1d0h'],[468000000,'5d10h']])assert.equal(d.countdown(at(ms),now),label)
 assert.equal(d.countdown(at(1),NaN),'—')
 const windows=[{label:'5h',resetsAt:at(300000)},{label:'7d',resetsAt:at(468000000)},{label:'other',resetsAt:null}]
 assert.deepEqual(windows.map(w=>d.countdown(w.resetsAt,now)),['5m','5d10h','—'])
})
