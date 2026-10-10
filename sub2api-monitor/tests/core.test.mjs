import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const directory=await mkdtemp(join(tmpdir(),'sub2api-test-'))
for(const file of ['model.ts','client.ts']){
  const text=await readFile(new URL('../'+file,import.meta.url),'utf8')
  await writeFile(join(directory,file),text.replaceAll("from './model'","from './model.ts'"))
}
const m=await import(pathToFileURL(join(directory,'model.ts')))
const {loadAccounts}=await import(pathToFileURL(join(directory,'client.ts')))
test.after(()=>rm(directory,{recursive:true,force:true}))
const now=Date.parse('2026-10-09T12:00:00Z')
const raw={id:1,name:'GPT work',platform:'openai',group_ids:[1],status:'active',credentials:{access_token:'NEVER_CACHE'},extra:{codex_5h_used_percent:125,codex_7d_used_percent:0,codex_5h_reset_after_seconds:3600,codex_usage_updated_at:'2026-10-09T11:30:00Z',secret:'NEVER_CACHE'}}
const stats={cost:1.25,tokens:12345,standard_cost:9,user_cost:3}
test('HTTPS origin normalization keeps deployment prefix and refuses credential URLs',()=>{
 assert.equal(m.normalizeBaseURL('https://example.org/sub/api/v1/'),'https://example.org/sub')
 for(const url of ['http://example.org','https://a:b@example.org','https://example.org?q=secret','https://example.org#secret'])assert.throws(()=>m.normalizeBaseURL(url))
})
test('ID order is stable, duplicate IDs not double-counted',()=>{assert.deepEqual(m.parseIDs('3,1，3 2'),[3,1,2]);for(const text of ['','-1','1.1','0','Infinity','1,x'])assert.throws(()=>m.parseIDs(text))})
test('over-limit remains 125% in model and drawing clamps only',()=>{const a=m.normalizeAccount(raw,stats,{},now);assert.equal(a.windows[0].percent,125);assert.equal(m.barPercent(a.windows[0].percent),100);assert.equal(m.estimatedRemaining(a.windows[0]),'估算剩余 0%')})
test('missing measurement is unknown, real zero remains zero',()=>{const a=m.normalizeAccount(raw,stats,{},now);assert.equal(a.windows[1].percent,0);assert.equal(m.normalizeAccount({...raw,extra:{}},null,{},now).windows.length,0)})
test('relative reset is anchored to sample timestamp, never fetch time',()=>{assert.equal(m.normalizeAccount(raw,stats,{},now).windows[0].resetsAt,'2026-10-09T12:30:00.000Z');assert.equal(m.normalizeAccount({...raw,extra:{codex_5h_used_percent:0,codex_5h_reset_after_seconds:3600}},null,{},now).windows[0].resetsAt,null)})
test('huge malformed reset seconds cannot crash',()=>{const a=m.normalizeAccount({...raw,extra:{...raw.extra,codex_5h_reset_after_seconds:Number.MAX_VALUE}},null,{},now);assert.equal(a.windows[0].resetsAt,null)})
test('Anthropic fractions mapped correctly and no invented 80% fallback',()=>{const a=m.normalizeAccount({id:2,platform:'anthropic',extra:{session_window_utilization:.42,passive_usage_7d_utilization:.99,passive_usage_7d_reset:1791547200,passive_usage_sampled_at:'2026-10-09T11:00:00Z'}},stats,{},now);assert.equal(a.windows[0].percent,42);assert.equal(a.windows[1].percent,99);assert.equal(m.normalizeAccount({id:2,platform:'anthropic',session_window_status:'allowed_warning',extra:{}},stats,{},now).windows.length,0)})
test('actual OpenAI window duration overrides generic 5h/7d caption',()=>{const a=m.normalizeAccount({...raw,extra:{...raw.extra,codex_5h_window_minutes:60,codex_7d_window_minutes:1440}},stats,{},now);assert.equal(a.windows[0].label,'1h');assert.equal(a.windows[1].label,'1d')})
test('cache model allowlists display data, does not retain credentials or raw extra',()=>{const a=m.normalizeAccount(raw,stats,{'1':'Development'},now);assert.ok(!JSON.stringify(a).includes('NEVER_CACHE'));assert.equal(a.todayCost,1.25);assert.equal(a.todayTokens,12345);assert.deepEqual(a.groups,['Development'])})
test('Antigravity is unsupported for passive quota, not zero or fake 5h',()=>{assert.deepEqual(m.normalizeAccount({id:3,platform:'antigravity',extra:{}},stats,{},now).windows,[])})
test('staleness and expired resets honest',()=>{assert.equal(m.isStale('2026-10-09T10:00:00Z',60,now),true);assert.equal(m.isStale(null,60,now),true);assert.equal(m.relativeReset('2026-10-09T10:00:00Z',now),'待更新快照')})
test('reference caps explicit, no default invented dollar quota',()=>{assert.equal(m.referenceRemaining({percent:25},undefined),null);assert.equal(m.referenceRemaining({percent:25},20),'参考余 $15.0');assert.deepEqual(m.parseReferenceCaps('{"1":{"fiveHour":20}}'),{'1':{fiveHour:20}});assert.throws(()=>m.parseReferenceCaps('{"1":{"fiveHour":-1}}'))})
test('all requests use HTTPS GET, decline redirects, bounded known paths',async()=>{
 const calls=[]; const config={...m.DEFAULT_CONFIG,demo:false,baseURL:'https://example.org',accountIDs:[1]}
 const fetcher=async(url,options)=>{calls.push({url,options});return{ok:true,status:200,json:async()=>({code:0,data:url.includes('groups/')?[{id:1,name:'开发'}]:url.endsWith('today-stats')?stats:raw})}}
 const r=await loadAccounts(config,{kind:'apiKey',token:'TEST_ONLY'},fetcher)
 assert.equal(r.accounts[0].id,1);assert.equal(calls.length,2)
 for(const call of calls){assert.equal(call.options.method,'GET');assert.equal(await call.options.handleRedirect(),null);assert.equal(call.options.headers['x-api-key'],'TEST_ONLY');assert.ok(!call.url.includes('/1/usage'));assert.ok(!call.url.includes('today-stats'));assert.ok(!call.url.includes('TEST_ONLY'))}
 assert.ok(!JSON.stringify(r).includes('TEST_ONLY'));assert.ok(!JSON.stringify(r).includes('NEVER_CACHE'))
})
test('401 keeps previous account snapshot and does not leak server errors',async()=>{
 const previous=m.normalizeAccount(raw,stats,{},now)
 const r=await loadAccounts({...m.DEFAULT_CONFIG,baseURL:'https://example.org',accountIDs:[1]}, {kind:'jwt',token:'SECRET'},async()=>({ok:false,status:401,json:async()=>({error:'SECRET'})}),[previous])
 assert.equal(r.accounts[0].windows[0].percent,125);assert.equal(r.accounts[0].fetchedAt,previous.fetchedAt);assert.equal(r.accounts[0].error,'管理凭证失效或权限不足');assert.ok(!JSON.stringify(r).includes('SECRET'))
})
test('missing today aggregate remains unknown without erasing account quota',async()=>{
 const r=await loadAccounts({...m.DEFAULT_CONFIG,baseURL:'https://example.org',accountIDs:[1]}, {kind:'apiKey',token:'TEST'},async(url)=>({ok:!url.endsWith('today-stats'),status:url.endsWith('today-stats')?500:200,json:async()=>({code:0,data:url.includes('groups/')?[]:raw})}))
 assert.equal(r.accounts[0].windows[0].percent,125);assert.equal(r.accounts[0].todayCost,null);assert.equal(r.accounts[0].error,undefined)
})
test('mismatched account response fails closed',async()=>{const r=await loadAccounts({...m.DEFAULT_CONFIG,baseURL:'https://example.org',accountIDs:[9]}, {kind:'apiKey',token:'TEST'},async()=>({ok:true,status:200,json:async()=>({code:0,data:raw})}));assert.equal(r.accounts[0].id,9);assert.equal(r.accounts[0].error,'账号响应不匹配')})
test('demo clearly synthetic has all requested providers and no network',()=>{const a=m.makeDemo(now);assert.equal(a.length,4);assert.deepEqual(a.map(x=>x.provider),['openai','anthropic','antigravity','openai'])})
test('malformed cache is rejected and cache decoder re-whitelists',()=>{assert.equal(m.validateCachedAccount(null),null);assert.equal(m.validateCachedAccount({id:1,provider:'openai',windows:[null],groups:[]}),null);const a=m.normalizeAccount(raw,stats,{},now);assert.ok(!JSON.stringify(m.validateCachedAccount({...a,credentials:'SECRET'})).includes('SECRET'));assert.equal(m.validateCachedAccount(a).id,1)})
test('too many IDs and non-object reference config are errors instead of silent truncation',()=>{assert.throws(()=>m.parseIDs(Array.from({length:13},(_,i)=>i+1).join(',')));assert.throws(()=>m.parseReferenceCaps('[]'));assert.throws(()=>m.parseReferenceCaps('null'))})
test('overflowing fraction is unknown; cap field typos fail explicitly',()=>{assert.equal(m.normalizeAccount({id:1,platform:'anthropic',extra:{session_window_utilization:Number.MAX_VALUE}},null,{},now).windows.length,0);assert.throws(()=>m.parseReferenceCaps('{"1":25}'));assert.throws(()=>m.parseReferenceCaps('{"1":{"foo":25}}'))})
test('widget parameters choose count/order and select demo IDs faithfully',()=>{const config={...m.DEFAULT_CONFIG,demo:false,accountIDs:[1,2,3,4,5]};assert.deepEqual(m.selectWidgetIDs(config,'2','systemMedium'),[2]);assert.deepEqual(m.selectWidgetIDs(config,'4,2','systemLarge'),[4,2]);assert.deepEqual(m.selectWidgetIDs(config,undefined,'systemLarge'),[1,2,3,4]);assert.deepEqual(m.selectWidgetIDs(m.DEFAULT_CONFIG,'103','systemMedium'),[103]);assert.throws(()=>m.selectWidgetIDs(config,'9','systemLarge'));assert.throws(()=>m.selectWidgetIDs(config,'1,2,3','systemMedium'));assert.throws(()=>m.selectWidgetIDs(config,'1,2','systemSmall'));assert.throws(()=>m.selectWidgetIDs(m.DEFAULT_CONFIG,'1','systemLarge'))})
test('adaptive layout covers medium 1–2 and large 1–4',()=>{assert.equal(m.widgetLayout('systemMedium',1),'mediumOne');assert.equal(m.widgetLayout('systemMedium',2),'mediumTwo');assert.equal(m.widgetLayout('systemLarge',1),'largeOne');assert.equal(m.widgetLayout('systemLarge',2),'largeTwo');for(const count of [3,4])assert.equal(m.widgetLayout('systemLarge',count),'largeRows');assert.equal(m.widgetLayout('systemSmall',1),'small')})
test('reset credits are cached-only, expire conservatively, never inherit auto-state timestamp',()=>{const future='2026-10-10T12:00:00Z',old='2026-10-08T12:00:00Z';const e={codex_reset_credit_snapshot:{available_count:3,credits:[{expires_at:future},{expires_at:old}]},codex_auto_reset_credit_state:{status:'available',checked_at:'2026-10-09T11:00:00Z',attempt_credit_hash:'SECRET_HASH'}};const a=m.normalizeAccount({...raw,extra:e},stats,{},now);assert.equal(a.resetCredits.available,1);assert.equal(a.resetCredits.expiresAt,'2026-10-10T12:00:00.000Z');assert.ok(!JSON.stringify(a).includes('SECRET_HASH'));assert.equal(m.normalizeAccount({...raw,extra:{codex_reset_credit_snapshot:{available_count:2,credits:[{expires_at:old}]}}},stats,{},now).resetCredits.available,null);assert.equal(m.normalizeAccount({...raw,parent_account_id:2,extra:e},stats,{},now).resetCredits,undefined)})
test('strict parser avoids undocumented URL global and ambiguous credential/host forms',()=>{assert.equal(m.normalizeBaseURL('HTTPS://Example.org:443/sub'),'https://example.org/sub');assert.equal(m.normalizeBaseURL('https://[::1]:8443/sub'),'https://[::1]:8443/sub');for(const url of ['https://user%40host.example','https://example.org\\@evil.test','https://host:0','https://host:65536','https://host:abc','https://host:443:90','https://host/../api','https://host/%2e%2e/api','https://host/secret?token=x','https://[foo]/','https://bad..host/'])assert.throws(()=>m.normalizeBaseURL(url),url)})
