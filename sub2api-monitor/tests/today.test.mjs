import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'sub2api-today-'))
for(const file of ['model.ts','client.ts','display.ts'])await writeFile(join(dir,file),(await readFile(new URL('../'+file,import.meta.url),'utf8')).replace("from './model'","from './model.ts'"))
const m=await import(pathToFileURL(join(dir,'model.ts'))),c=await import(pathToFileURL(join(dir,'client.ts'))),d=await import(pathToFileURL(join(dir,'display.ts')))
test.after(()=>rm(dir,{recursive:true,force:true}))
const now=Date.parse('2026-10-10T05:00:00Z'),zone='America/Los_Angeles'
const account=()=>({...m.normalizeAccount({id:1,platform:'openai'},null,{},now),todayCost:10,todayDate:'2026-10-09',todayTimeZone:zone,todayUpdatedAt:new Date(now).toISOString(),windows:[{label:'7d',percent:50,resetsAt:'2026-10-15T00:00:00Z',updatedAt:new Date(now).toISOString(),costStatus:'complete',usedUSD:100,estimatedTotalUSD:200}]})
test('local day differs from UTC and handles DST and year rollover without fixed offsets',()=>{
 assert.deepEqual(m.localDay(now,zone),{date:'2026-10-09',timeZone:zone})
 assert.equal(m.localDay(Date.parse('2026-03-08T09:59:00Z'),zone).date,'2026-03-08');assert.equal(m.localDay(Date.parse('2026-03-08T10:01:00Z'),zone).date,'2026-03-08')
 assert.equal(m.localDay(Date.parse('2026-12-31T16:01:00Z'),'Asia/Shanghai').date,'2027-01-01')
 assert.equal(m.localDay(now,'invalid/zone'),null)
})
test('today aggregate sends explicit local dates, IANA zone and account filter; only account cost accepted',async()=>{
 const a=account(),calls=[];await c.attachTodayCost(a,async path=>{calls.push(path);return {total_account_cost:10,total_cost:999}},now,zone)
 assert.equal(calls[0],'usage/stats?account_id=1&start_date=2026-10-09&end_date=2026-10-09&timezone=America%2FLos_Angeles&nocache=true');assert.equal(a.todayCost,10);assert.equal(a.todayDate,'2026-10-09');assert.equal(a.todayTimeZone,zone)
 assert.equal(d.todayUsage(a,m.DEFAULT_CONFIG,Date.parse(a.todayUpdatedAt),zone),'今日用量：5% / $10.0')
})
test('zero is measured zero; missing malformed and failed today stats clear old cost and date',async()=>{
 const a=account();await c.attachTodayCost(a,async()=>({total_account_cost:0}),now,zone);assert.equal(a.todayCost,0);assert.equal(d.todayUsage(a,m.DEFAULT_CONFIG,Date.parse(a.todayUpdatedAt),zone),'今日用量：0% / $0.00')
 for(const data of [{},{total_cost:15},{total_account_cost:null},{total_account_cost:-1},{total_account_cost:'3'},{total_account_cost:NaN}]){const a=account();await c.attachTodayCost(a,async()=>data,now,zone);assert.equal(a.todayCost,null);assert.equal(a.todayUpdatedAt,undefined);assert.equal(d.todayUsage(a,m.DEFAULT_CONFIG,now,zone),'今日用量：— / —')}
 const failed=account();await c.attachTodayCost(failed,async()=>{throw Error('offline')},now,zone);assert.equal(failed.todayCost,null);assert.equal(failed.fetchedAt,new Date(now).toISOString())
})
test('invalid timezone means no guessed request',async()=>{
 const a=account();let calls=0;await c.attachTodayCost(a,async()=>{calls++;return{}},now,'invalid/zone');assert.equal(calls,0);assert.equal(a.todayCost,null)
})
test('rollover timezone change stale sample future sample old cache and account failure show unknown',()=>{
 const a=account();for(const [value,time,tz] of [[a,now+3*3600000,zone],[a,now,'Asia/Shanghai'],[{...a,todayUpdatedAt:new Date(now-61*60000).toISOString()},now,zone],[{...a,todayUpdatedAt:new Date(now+1000).toISOString()},now,zone],[{...a,todayDate:undefined},now,zone],[{...a,error:'offline'},now,zone],[{...a,todayUpdatedAt:'bad'},now,zone]])assert.equal(d.todayUsage(value,m.DEFAULT_CONFIG,time,tz),'今日用量：— / —')
})
test('unknown zero expired stale or invalid weekly denominator keeps amount but never invents percent',()=>{
 for(const patch of [{estimatedTotalUSD:null},{estimatedTotalUSD:0},{estimatedTotalUSD:NaN},{costStatus:'unavailable'},{resetsAt:new Date(now).toISOString()},{updatedAt:new Date(now-61*60000).toISOString()}]){const a=account();Object.assign(a.windows[0],patch);assert.equal(d.todayUsage(a,m.DEFAULT_CONFIG,now,zone),'今日用量：— / $10.0')}
 const a=account();a.todayCost=300;assert.equal(d.todayUsage(a,m.DEFAULT_CONFIG,now,zone),'今日用量：150% / $300.0')
})
test('cache whitelist preserves daily identity; legacy data without daily identity stays unknown',()=>{
 const a=account(),cached=m.validateCachedAccount({...a,rawStats:{secret:'NO'}});assert.equal(cached.todayDate,a.todayDate);assert.equal(cached.todayTimeZone,zone);assert.equal(cached.todayUpdatedAt,a.todayUpdatedAt);assert.equal(d.todayUsage(cached,m.DEFAULT_CONFIG,now,zone),'今日用量：5% / $10.0');assert.ok(!JSON.stringify(cached).includes('NO'))
 const legacy=m.validateCachedAccount({...a,todayDate:undefined});assert.equal(d.todayUsage(legacy,m.DEFAULT_CONFIG,now,zone),'今日用量：— / —')
})
test('account failure keeps original success timestamp and suppresses retained daily stats',async()=>{
 const a=account();const result=await c.loadAccounts({...m.DEFAULT_CONFIG,baseURL:'https://example.org',accountIDs:[1]},{kind:'apiKey',token:'TEST'},async()=>{throw Error('offline')},[a]);assert.equal(result.accounts[0].fetchedAt,a.fetchedAt);assert.equal(d.todayUsage(result.accounts[0],m.DEFAULT_CONFIG,now,zone),'今日用量：— / —');assert.equal(d.oldestSuccessfulRead(result.accounts),a.fetchedAt)
})

test('request crossing local midnight discards yesterday result instead of stamping it today',async()=>{
 const original=Date.now,near=Date.parse('2026-10-10T06:59:59Z');let wall=1000;Date.now=()=>wall
 try{const a=account();await c.attachTodayCost(a,async()=>{wall+=2000;return {total_account_cost:9}},near,zone);assert.equal(a.todayCost,null);assert.equal(a.todayUpdatedAt,undefined)}finally{Date.now=original}
})
