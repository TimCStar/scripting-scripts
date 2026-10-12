import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'sub2api-amount-reliability-'))
for(const file of ['model.ts','client.ts','display.ts','state.ts'])await writeFile(join(dir,file),(await readFile(new URL('../'+file,import.meta.url),'utf8')).replaceAll("from './model'","from './model.ts'"))
const m=await import(pathToFileURL(join(dir,'model.ts'))),c=await import(pathToFileURL(join(dir,'client.ts'))),d=await import(pathToFileURL(join(dir,'display.ts'))),s=await import(pathToFileURL(join(dir,'state.ts')))
test.after(()=>rm(dir,{recursive:true,force:true}))
const now=Date.parse('2026-10-12T15:00:00Z'),zone='UTC',stamp=t=>new Date(t).toISOString()
const config={...m.DEFAULT_CONFIG,demo:false,baseURL:'https://example.org',accountIDs:[1]}
const account=()=>({id:1,name:'Synthetic',provider:'openai',groups:[],status:'active',fetchedAt:stamp(now-60000),readStartedAt:stamp(now-61000),estimate:'test',todayCost:13.4,todayDate:'2026-10-12',todayTimeZone:zone,todayUpdatedAt:stamp(now-60000),todayTokens:null,windows:[{label:'7d',percent:6,resetsAt:'2026-10-18T00:00:00.000Z',updatedAt:stamp(now-2*3600000),costStatus:'complete',usedUSD:24.5,estimatedTotalUSD:24.5*100/6,costUpdatedAt:stamp(now-60000),costSampledAt:stamp(now-2*3600000),costPercent:6}]})
const failed=()=>{const a=account();a.todayCost=null;delete a.todayUpdatedAt;a.todayIssue='request';Object.assign(a.windows[0],{usedUSD:null,estimatedTotalUSD:null,costStatus:'unavailable',costIssue:'request'});delete a.windows[0].costUpdatedAt;return a}
test('screenshot case retains total and today percentage with old but current-window provider sample',()=>{
 const a=account();assert.equal(d.windowDollars(a.windows[0],config,now),'$24.5 / $408.3');assert.equal(d.todayUsage(a,config,now,zone),'今日用量：3.3% / $13.4')
 assert.equal(d.snapshotNote(a,a.windows[0],now),'');a.todayUpdatedAt=stamp(now-3*3600000);assert.equal(d.todayUsage(a,config,now,zone),'今日用量：3.3% / $13.4')
})
test('weekly sample must belong to exact live window and valid timestamp; small clock skew is explicit',()=>{
 for(const time of [null,'bad','2026-10-10T23:59:59Z',stamp(now+300001)]){const w={...account().windows[0],updatedAt:time,costSampledAt:undefined};assert.equal(m.validWeeklySample(w,now),false);assert.equal(d.windowDollars(w,config,now),'$24.5 / —')}
 for(const time of ['2026-10-11T00:00:00Z',stamp(now+300000)])assert.equal(m.validWeeklySample({...account().windows[0],costSampledAt:time},now),true)
 for(const resetsAt of [null,'bad',stamp(now),stamp(now+8*86400000)])assert.equal(d.windowDollars({...account().windows[0],resetsAt},config,now),'— / —')
})
test('partial request fallback preserves per-field times and original paired percent rather than recomputing',()=>{
 const old=account(),fresh=failed();fresh.windows[0].percent=20;fresh.windows[0].updatedAt=stamp(now)
 m.retainFailedAmounts(fresh,old,now,zone)
 assert.equal(fresh.todayCost,13.4);assert.equal(fresh.todayUpdatedAt,old.todayUpdatedAt);assert.equal(fresh.todayFallback,true)
 assert.equal(fresh.windows[0].costUpdatedAt,old.windows[0].costUpdatedAt);assert.equal(fresh.windows[0].costPercent,6);assert.equal(fresh.windows[0].percent,20)
 assert.equal(d.windowDollars(fresh.windows[0],config,now),'$24.5 / $408.3');assert.equal(d.todayUsage(fresh,config,now,zone),'今日用量：3.3% / $13.4 · 旧快照');assert.equal(d.snapshotNote(fresh,fresh.windows[0],now),'旧快照')
 assert.equal(old.todayFallback,undefined)
})
test('no fallback from malformed success, changed provider, expired day, changed timezone or changed window',()=>{
 for(const patch of [{todayIssue:'invalid'},{todayIssue:'day'},{todayIssue:'timezone'}]){const a={...failed(),...patch};m.retainFailedAmounts(a,account(),now,zone);assert.equal(a.todayCost,null)}
 for(const patch of [{provider:'anthropic'},{todayDate:'2026-10-11'},{todayTimeZone:'Asia/Shanghai'},{todayUpdatedAt:stamp(now+1)}]){const a=failed();m.retainFailedAmounts(a,{...account(),...patch},now,zone);assert.equal(a.todayCost,null)}
 for(const patch of [{costIssue:'invalid'},{resetsAt:stamp(now)},{resetsAt:'2026-10-17T00:00:00Z'}]){const a=failed();Object.assign(a.windows[0],patch);m.retainFailedAmounts(a,account(),now,zone);assert.equal(a.windows[0].usedUSD,null)}
 for(const patch of [{costUpdatedAt:undefined},{costUpdatedAt:stamp(now+1)},{costUpdatedAt:'2026-10-10T23:59:59Z'}]){const a=failed(),old=account();Object.assign(old.windows[0],patch);m.retainFailedAmounts(a,old,now,zone);assert.equal(a.windows[0].usedUSD,null)}
})
test('weekly expiry hides only weekly and derived percent; day rollover hides today independently',()=>{
 const a=account();assert.equal(d.todayUsage(a,config,Date.parse('2026-10-13T00:00:00Z'),zone),'今日用量：— / —')
 a.windows[0].resetsAt=stamp(now);assert.equal(d.windowDollars(a.windows[0],config,now),'— / —');assert.equal(d.todayUsage(a,config,now,zone),'今日用量：— / $13.4')
})
test('cache whitelist roundtrip keeps provenance but sanitizes arbitrary issue strings',()=>{
 const a=failed();m.retainFailedAmounts(a,account(),now,zone);const b=m.validateCachedAccount(a)
 assert.equal(b.todayFallback,true);assert.equal(b.todayIssue,'request');assert.equal(b.windows[0].costFallback,true);assert.equal(b.windows[0].costPercent,6);assert.equal(b.windows[0].costUpdatedAt,a.windows[0].costUpdatedAt)
 a.todayIssue='SECRET';a.windows[0].costIssue='SECRET';assert.ok(!JSON.stringify(m.validateCachedAccount(a)).includes('SECRET'))
})
test('unknown reason distinguishes malformed statistics and transport failure without valid cache',async()=>{
 const a=account();await c.attachTodayCost(a,async()=>({}),now,zone);assert.equal(a.todayIssue,'invalid');assert.equal(a.todayCost,null)
 await c.attachTodayCost(a,async()=>{throw Error('offline')},now,zone);assert.equal(a.todayIssue,'request')
 const w=a.windows[0];await c.attachSevenDayCost(w,1,async()=>({}),60,now);assert.equal(w.costIssue,'invalid')
 await c.attachSevenDayCost(w,1,async()=>{throw Error('offline')},60,now);assert.equal(w.costIssue,'request')
})
test('request spanning weekly reset or clock reversal does not stamp money as valid',async()=>{
 const original=Date.now;let wall=1000;Date.now=()=>wall
 try{const w={...account().windows[0],resetsAt:stamp(now+1000)};await c.attachSevenDayCost(w,1,async()=>{wall+=2000;return {total_account_cost:4}},60,now);assert.equal(w.usedUSD,null)
 const a=account();await c.attachTodayCost(a,async()=>{wall-=100;return {total_account_cost:4}},now,zone);assert.equal(a.todayCost,null)
 }finally{Date.now=original}
})
test('commit-time fallback uses latest successful field rather than cache captured before requests',()=>{
 const original=Date.now;Date.now=()=>now
 let stored;globalThis.Storage={get:()=>stored,set:(_key,value)=>{stored=value;return true}}
 try{const latest=account();latest.todayTimeZone=m.localDay(now).timeZone;latest.todayCost=18;latest.windows[0].usedUSD=30;latest.windows[0].estimatedTotalUSD=500;s.commitCache(config,[latest],stamp(now))
 const a=failed();a.todayTimeZone=m.localDay(now).timeZone;a.readStartedAt=stamp(now);m.retainFailedAmounts(a,{...account(),todayTimeZone:m.localDay(now).timeZone},now);const result=s.commitCache(config,[a],stamp(now));assert.equal(result.accounts[0].todayCost,18);assert.equal(result.accounts[0].windows[0].usedUSD,30)
 }finally{Date.now=original;delete globalThis.Storage}
})

test('full load survives intermittent stats transport failures and recovery resets field provenance',async()=>{
 const original=Date.now;Date.now=()=>now
 const ok=data=>({ok:true,status:200,json:async()=>({code:0,data})})
 const raw={id:1,name:'Synthetic',platform:'openai',extra:{codex_7d_used_percent:6,codex_7d_reset_at:'2026-10-18T00:00:00Z',codex_usage_updated_at:stamp(now-2*3600000)}}
 const fetcher=async url=>ok(url.includes('/accounts/')?raw:{total_account_cost:24.5})
 try{
  const first=await c.loadAccounts(config,{kind:'apiKey',token:'TEST'},fetcher)
  const failed=await c.loadAccounts(config,{kind:'apiKey',token:'TEST'},async url=>url.includes('/accounts/')?ok(raw):{ok:false,status:503},first.accounts)
  const a=failed.accounts[0];assert.equal(a.todayFallback,true);assert.equal(a.windows[0].costFallback,true);assert.equal(a.windows[0].estimatedTotalUSD,24.5*100/6);assert.equal(a.todayUpdatedAt,first.accounts[0].todayUpdatedAt)
  const recovered=await c.loadAccounts(config,{kind:'apiKey',token:'TEST'},fetcher,failed.accounts)
  assert.equal(recovered.accounts[0].todayFallback,undefined);assert.equal(recovered.accounts[0].windows[0].costFallback,undefined);assert.deepEqual(recovered.errors,{})
  const malformed=await c.loadAccounts(config,{kind:'apiKey',token:'TEST'},async url=>ok(url.includes('/accounts/')?raw:{}),first.accounts)
  assert.equal(malformed.accounts[0].todayCost,null);assert.equal(malformed.accounts[0].windows[0].usedUSD,null);assert.equal(malformed.accounts[0].todayFallback,undefined)
 }finally{Date.now=original}
})

test('malformed or absent retained paired metadata cannot regain estimate through cache validation',()=>{
 for(const patch of [{costSampledAt:'bad'},{costSampledAt:undefined},{costPercent:null},{costPercent:undefined},{costUpdatedAt:'bad'}]){
  const a=account();Object.assign(a.windows[0],{costFallback:true,updatedAt:stamp(now),percent:40},patch)
  assert.equal(d.windowDollars(a.windows[0],config,now),'$24.5 / —')
  const cached=m.validateCachedAccount(a);assert.equal(d.windowDollars(cached.windows[0],config,now),'$24.5 / —')
  const next=failed();m.retainFailedAmounts(next,cached,now,zone);assert.ok(!d.windowDollars(next.windows[0],config,now).includes('$408.3'))
 }
})
test('representative fallback footer still fits existing single-line minimum scale without layout changes',()=>{
 const a=account();a.todayFallback=true;const text=d.todayUsage(a,config,now,zone)
 const units=[...text].reduce((sum,c)=>sum+(c.charCodeAt(0)>255?1:0.6),0)
 assert.ok(units*11*0.65<=127,'Small single-account footer width')
 assert.ok(([...'短别名 · '].reduce((sum,c)=>sum+(c.charCodeAt(0)>255?1:0.6),0)+units)*11*0.65<=305,'Multiaccount full-width footer')
})
