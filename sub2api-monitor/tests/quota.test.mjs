import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const directory=await mkdtemp(join(tmpdir(),'sub2api-quota-test-'))
for(const file of ['model.ts','client.ts']) await writeFile(join(directory,file),(await readFile(new URL('../'+file,import.meta.url),'utf8')).replace("from './model'","from './model.ts'"))
const m=await import(pathToFileURL(join(directory,'model.ts')))
const {attachSevenDayCost,loadAccounts}=await import(pathToFileURL(join(directory,'client.ts')))
test.after(()=>rm(directory,{recursive:true,force:true}))
const now=Date.parse('2026-10-09T12:00:00Z')
const window=()=>({label:'7d',percent:25,resetsAt:'2026-10-12T06:00:00Z',updatedAt:'2026-10-09T11:50:00Z'})
const row=(id,time,cost=2)=>({id,account_id:1,created_at:time,total_cost:99,account_stats_cost:cost,account_rate_multiplier:3})
const page=(items,total=items.length,p=1)=>({items,total,page:p,page_size:500})
test('exact reset boundary, UTC whole dates, account cost override and multiplier',async()=>{
 const calls=[],w=window()
 await attachSevenDayCost(w,1,async path=>{calls.push(path);return path.startsWith('usage/stats')?{total_account_cost:10,total_cost:999}:page([row(1,'2026-10-05T05:59:59Z'),row(2,'2026-10-05T06:00:00Z'),row(3,'2026-10-05T23:59:59.999Z',1)])},60,now)
 assert.equal(w.usedUSD,19);assert.equal(w.estimatedTotalUSD,76);assert.equal(w.costStatus,'complete')
 assert.ok(calls[0].includes('start_date=2026-10-06&end_date=2026-10-09&timezone=UTC&nocache=true'))
 assert.ok(calls[1].includes('start_date=2026-10-05&end_date=2026-10-05&timezone=UTC&exact_total=true'))
})
test('midnight reset start uses one aggregate request without boundary duplication',async()=>{
 const w={...window(),resetsAt:'2026-10-12T00:00:00Z'},calls=[]
 await attachSevenDayCost(w,1,async path=>{calls.push(path);return {total_account_cost:11}},60,now)
 assert.equal(calls.length,1);assert.ok(calls[0].includes('start_date=2026-10-05'));assert.equal(w.usedUSD,11)
})
test('stale ratio retains exact used accounting cost but suppresses estimate',async()=>{
 const w={...window(),updatedAt:'2026-10-09T09:00:00Z'}
 await attachSevenDayCost(w,1,async path=>path.startsWith('usage/stats')?{total_account_cost:12}:page([]),60,now)
 assert.equal(w.usedUSD,12);assert.equal(w.estimatedTotalUSD,null)
})
test('expired or unknown reset never silently becomes rolling week',async()=>{
 for(const reset of [null,'2026-10-08T00:00:00Z']){let calls=0;const w={...window(),resetsAt:reset};await attachSevenDayCost(w,1,async()=>{calls++;return{}},60,now);assert.equal(calls,0);assert.equal(w.usedUSD,null)}
})
test('missing aggregate account cost never substitutes standard/user costs',async()=>{
 const w=window();await attachSevenDayCost(w,1,async()=>({total_cost:99,total_actual_cost:7}),60,now);assert.equal(w.usedUSD,null)
})
test('zero cost and zero percent remain measured zero without invented denominator',async()=>{
 const w={...window(),percent:0};await attachSevenDayCost(w,1,async path=>path.startsWith('usage/stats')?{total_account_cost:0}:page([]),60,now)
 assert.equal(w.usedUSD,0);assert.equal(w.percent,0);assert.equal(w.estimatedTotalUSD,null);assert.equal(m.estimatedTotalCost(5,0),null)
})
test('boundary day over 2000 rows never publishes partial cost',async()=>{
 const w=window();await attachSevenDayCost(w,1,async path=>path.startsWith('usage/stats')?{total_account_cost:12}:page([],2001),60,now)
 assert.equal(w.costStatus,'truncated');assert.equal(w.usedUSD,null)
})
test('all pages required, duplicate IDs and changed counts fail closed',async()=>{
 for(const mode of ['ok','duplicate','changed']){
 const w=window(),items=Array.from({length:500},(_,i)=>row(i+1,'2026-10-05T12:00:00Z',1))
 await attachSevenDayCost(w,1,async path=>path.startsWith('usage/stats')?{total_account_cost:0}:path.endsWith('page=1')?page(items,501):page([row(mode==='duplicate'?500:501,'2026-10-05T12:00:00Z',1)],mode==='changed'?502:501,2),60,now)
 assert.equal(w.usedUSD,mode==='ok'?1503:null)
 }
})
test('row validation rejects other accounts, bad cost, missing timestamp; null cost fallback preserves zero',()=>{
 assert.equal(m.accountLogCost({...row(1,'2026-10-05T12:00:00Z'),account_id:2},1,0,now),null)
 assert.equal(m.accountLogCost({...row(1,'2026-10-05T12:00:00Z'),account_stats_cost:null,total_cost:4,account_rate_multiplier:null},1,0,now),4)
 assert.equal(m.accountLogCost(row(1,'2026-10-05T12:00:00Z',0),1,0,now),0)
 assert.equal(m.accountLogCost(row(1,'bad'),1,0,now),null)
 assert.equal(m.accountLogCost(row(1,'2026-10-05T12:00:00Z',NaN),1,0,now),null)
})
test('fresh load uses only account and local stats/logs for Claude and OpenAI, no provider probe',async()=>{
 for(const platform of ['openai','anthropic']){
 const t=Date.now(),reset=new Date(Math.floor(t/86400000)*86400000+3*86400000).toISOString(),sample=new Date(t).toISOString(),calls=[]
 const extra=platform==='openai'?{codex_7d_used_percent:25,codex_7d_reset_at:reset,codex_usage_updated_at:sample}:{passive_usage_7d_utilization:.25,passive_usage_7d_reset:Date.parse(reset)/1000,passive_usage_sampled_at:sample}
 const result=await loadAccounts({...m.DEFAULT_CONFIG,baseURL:'https://example.org',accountIDs:[1]}, {kind:'apiKey',token:'SECRET'},async(url,options)=>{calls.push(url);assert.equal(options.method,'GET');return {ok:true,status:200,json:async()=>({code:0,data:url.includes('usage/stats?')?{total_account_cost:20}:{id:1,platform,extra}})}})
 assert.equal(result.accounts[0].windows.find(w=>w.label==='7d').usedUSD,20)
 assert.equal(calls.length,3);assert.ok(calls.every(url=>!url.includes('today-stats')&&!url.includes('groups')&&!url.includes('/quota')&&!url.includes('/1/usage')))
 assert.ok(!JSON.stringify(result).includes('SECRET'))
 }
})

test('absent Anthropic 5h omitted while real measured zero is kept',()=>{
 const e={passive_usage_7d_utilization:.25,passive_usage_7d_reset:Date.parse('2026-10-12T06:00:00Z')/1000}
 assert.deepEqual(m.normalizeAccount({id:1,platform:'anthropic',extra:e},null,{},now).windows.map(w=>w.label),['7d'])
 const a=m.normalizeAccount({id:1,platform:'anthropic',extra:{...e,session_window_utilization:0}},null,{},now)
 assert.equal(a.windows[0].label,'5h');assert.equal(a.windows[0].percent,0)
})
