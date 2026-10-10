import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

const dir=await mkdtemp(join(tmpdir(),'sub2api-request-status-'))
for(const file of ['model.ts','client.ts','display.ts','state.ts']){
  const source=await readFile(new URL('../'+file,import.meta.url),'utf8')
  await writeFile(join(dir,file),source.replaceAll("from './model'","from './model.ts'"))
}
const m=await import(pathToFileURL(join(dir,'model.ts')))
const c=await import(pathToFileURL(join(dir,'client.ts')))
const d=await import(pathToFileURL(join(dir,'display.ts')))
test.after(()=>rm(dir,{recursive:true,force:true}))

const now=Date.parse('2026-10-10T12:00:00Z')
const config={...m.DEFAULT_CONFIG,demo:false,baseURL:'https://example.org',accountIDs:[1]}
const secret='REQUEST_STATUS_SECRET_MUST_NOT_LEAK'
const auth={kind:'apiKey',token:secret}
const ok=value=>({ok:true,status:200,json:async()=>({code:0,data:value})})
const http=status=>({ok:false,status,json:async()=>{throw Error(`Do not read error body ${secret}`)}})
const raw=(id=1,time=Date.now(),partial=false)=>({id,name:`Account ${id}`,platform:'openai',status:'active',extra:{
  codex_5h_used_percent:37,
  codex_5h_reset_at:new Date(time+3600000).toISOString(),
  codex_7d_used_percent:25,
  // A UTC-midnight reset uses only aggregate stats; a non-midnight reset also
  // exercises the first partial day's local usage log request.
  codex_7d_reset_at:new Date(Math.floor(time/86400000)*86400000+3*86400000+(partial?3600000:0)).toISOString(),
  codex_usage_updated_at:new Date(time-2*3600000).toISOString()
}})
const previous=()=>m.normalizeAccount(raw(1,now),null,{},now)
const isAccount=url=>/\/accounts\/\d+$/.test(url)
const isToday=url=>{const parsed=new URL(url);return parsed.searchParams.get('start_date')===parsed.searchParams.get('end_date')}
const goodFetch=async url=>isAccount(url)?ok(raw(Number(url.match(/\d+$/)[0]))):ok({total_account_cost:10})
function assertReported(result,id,cause){
  const account=result.accounts.find(a=>a.id===id)
  assert.ok(Array.isArray(account.requestErrors),'Request failures need per-account structured reporting')
  assert.ok(account.requestErrors.every(x=>typeof x==='string'))
  assert.ok(account.requestErrors.some(x=>x.includes(cause)),cause)
  assert.ok(result.errors[String(id)]?.includes(cause),'Partial failures must also reach LoadResult.errors')
  assert.ok(!JSON.stringify(result).includes(secret),'Tokens and raw errors never enter results or cacheable account models')
  return account
}

test('aged successful upstream samples are not failed cached snapshots',()=>{
  const account=previous()
  assert.ok(m.isStale(account.windows[0].updatedAt,config.staleMinutes,now))
  for(const window of account.windows){
    assert.equal(d.snapshotNote(account,window,now),'')
    assert.equal(d.snapshotNote({...account,fetchedAt:new Date(now-4*3600000).toISOString()},window,now),'')
    assert.equal(d.snapshotNote({...account,requestErrors:['今日统计：网络连接失败']},window,now),'')
  }
})

test('only failed account reads with a successful cached sample get the old snapshot label',()=>{
  const account=previous(),window=account.windows[0]
  assert.equal(d.snapshotNote({...account,error:'网络连接失败'},window,now),'旧快照')
  assert.equal(d.snapshotNote({...account,error:'网络连接失败'}, {...window,resetsAt:new Date(now-1).toISOString()},now),'旧快照')
  assert.notEqual(d.snapshotNote({...account,fetchedAt:'',error:'网络连接失败'},window,now),'旧快照')
})

test('reset expiry is separate from request failure and does not roll the window forward',()=>{
  const account=previous(),window=account.windows[0]
  for(const offset of [-1,0])assert.equal(d.snapshotNote(account,{...window,resetsAt:new Date(now+offset).toISOString()},now),'待更新')
  assert.equal(d.snapshotNote(account,{...window,resetsAt:new Date(now+1).toISOString()},now),'')
  for(const resetsAt of [null,undefined,'','invalid'])assert.equal(d.snapshotNote(account,{...window,resetsAt},now),'')
})

test('safe request error whitelist does not echo attacker-controlled prefixed errors',()=>{
  const allowed=['管理凭证失效或权限不足','接口或账号不存在','服务器返回格式不兼容','接口版本或权限不兼容','账号响应不匹配','服务器暂不可用（500）','服务器暂不可用（503）','网络请求超时','网络连接失败']
  for(const message of allowed)assert.equal(c.safeRequestError(new Error(message)),message)
  for(const message of allowed){
    const safe=c.safeRequestError(new Error(`${message}: https://example.org/?token=${secret}`))
    assert.ok(!safe.includes(secret))
    assert.ok(!safe.includes('https://'))
    assert.ok(['网络连接失败','网络请求超时'].includes(safe))
  }
  for(const error of [null,undefined,42,secret,{message:secret},new Error(secret)])assert.equal(c.safeRequestError(error),'网络连接失败')
})

test('timeout names and network failures have distinct safe messages without guessing abort reasons',()=>{
  assert.equal(c.safeRequestError(Object.assign(new Error(`Request ${secret}`),{name:'TimeoutError'})),'网络请求超时')
  assert.equal(c.safeRequestError(Object.assign(new Error(`Request ${secret}`),{name:'AbortError'})),'网络连接失败')
  assert.equal(c.safeRequestError(new TypeError(`Failed to fetch ${secret}`)),'网络连接失败')
})

test('main-request HTTP errors preserve cached data and the original success timestamp',async()=>{
  for(const [status,message] of [[401,'管理凭证失效或权限不足'],[403,'管理凭证失效或权限不足'],[404,'接口或账号不存在'],[429,'服务器暂不可用（429）'],[500,'服务器暂不可用（500）'],[503,'服务器暂不可用（503）']]){
    const cached=previous(),before=structuredClone(cached)
    const result=await c.loadAccounts(config,auth,async()=>http(status),[cached])
    const account=result.accounts[0]
    assert.equal(account.error,message)
    assert.equal(result.errors['1'],message)
    assert.deepEqual(account.windows,cached.windows)
    assert.equal(account.fetchedAt,cached.fetchedAt)
    assert.equal(d.snapshotNote(account,account.windows[0],now),'旧快照')
    assert.deepEqual(cached,before,'Fallback must not mutate the supplied cache')
    assert.ok(!JSON.stringify(result).includes(secret))
  }
})

test('offline and timeout failures distinguish cached snapshot from no successful data',async()=>{
  for(const [error,message] of [[new TypeError(`offline ${secret}`),'网络连接失败'],[Object.assign(new Error(secret),{name:'TimeoutError'}),'网络请求超时']]){
    const fetcher=async()=>{throw error}
    const retained=await c.loadAccounts(config,auth,fetcher,[previous()])
    assert.equal(retained.accounts[0].error,message)
    assert.equal(d.snapshotNote(retained.accounts[0],retained.accounts[0].windows[0],now),'旧快照')
    const empty=await c.loadAccounts(config,auth,fetcher)
    assert.equal(empty.accounts[0].error,message)
    assert.equal(empty.accounts[0].fetchedAt,'')
    assert.deepEqual(empty.accounts[0].windows,[])
    assert.equal(empty.accounts[0].todayCost,null)
    assert.equal(empty.errors['1'],message)
    assert.notEqual(d.snapshotNote(empty.accounts[0],{label:'7d',resetsAt:null,updatedAt:null,percent:null},now),'旧快照')
    assert.ok(!JSON.stringify([retained,empty]).includes(secret))
  }
})

test('a successful retry clears failed-read and partial-error state even when upstream sample is old',async()=>{
  const cached={...previous(),error:'管理凭证失效或权限不足',requestErrors:['今日统计：网络连接失败']}
  const result=await c.loadAccounts(config,auth,goodFetch,[cached])
  const account=result.accounts[0]
  assert.equal(account.error,undefined)
  assert.deepEqual(account.requestErrors??[],[])
  assert.deepEqual(result.errors,{})
  assert.notEqual(account.fetchedAt,cached.fetchedAt)
  assert.ok(m.isStale(account.windows[0].updatedAt,config.staleMinutes))
  assert.equal(d.snapshotNote(account,account.windows[0]),'')
  assert.equal(cached.error,'管理凭证失效或权限不足')
})

test('today-stat failure is reported while fresh account and weekly data remain usable',async()=>{
  const cached={...previous(),error:'网络连接失败'}
  const result=await c.loadAccounts(config,auth,async url=>isAccount(url)?ok(raw()):isToday(url)?http(503):ok({total_account_cost:10}),[cached])
  const account=assertReported(result,1,'服务器暂不可用（503）')
  assert.equal(account.error,undefined)
  assert.notEqual(account.fetchedAt,cached.fetchedAt)
  assert.equal(account.todayCost,null)
  assert.equal(account.todayUpdatedAt,undefined)
  assert.equal(account.windows.find(w=>w.label==='7d').costStatus,'complete')
  assert.equal(account.windows[0].percent,37)
  assert.equal(d.snapshotNote(account,account.windows[0]),'')
})

test('weekly-stat failure is reported without hiding a successful today aggregate',async()=>{
  const result=await c.loadAccounts(config,auth,async url=>isAccount(url)?ok(raw()):isToday(url)?ok({total_account_cost:4}):http(403))
  const account=assertReported(result,1,'管理凭证失效或权限不足')
  assert.equal(account.error,undefined)
  assert.equal(account.todayCost,4)
  assert.ok(account.todayUpdatedAt)
  assert.equal(account.windows.find(w=>w.label==='7d').costStatus,'unavailable')
  assert.equal(d.snapshotNote(account,account.windows[0]),'')
})

test('partial-day log request failure is visible and leaves weekly dollars unknown',async()=>{
  let logs=0
  const result=await c.loadAccounts(config,auth,async url=>{
    if(isAccount(url))return ok(raw(1,Date.now(),true))
    if(url.includes('/usage?')){logs++;throw Object.assign(new Error(secret),{name:'TimeoutError'})}
    return ok({total_account_cost:4})
  })
  assert.equal(logs,1)
  const account=assertReported(result,1,'网络请求超时')
  assert.equal(account.error,undefined)
  assert.equal(account.todayCost,4)
  assert.equal(account.windows.find(w=>w.label==='7d').costStatus,'unavailable')
  assert.equal(account.windows.find(w=>w.label==='7d').usedUSD,null)
})

test('multiple partial errors all reach the current account and aggregate result',async()=>{
  const result=await c.loadAccounts(config,auth,async url=>{
    if(isAccount(url))return ok(raw())
    if(isToday(url))throw new TypeError(`offline ${secret}`)
    return http(401)
  })
  const account=assertReported(result,1,'网络连接失败')
  assertReported(result,1,'管理凭证失效或权限不足')
  assert.equal(account.error,undefined)
  assert.equal(account.requestErrors.length,2)
  const recovered=await c.loadAccounts(config,auth,goodFetch,result.accounts)
  assert.equal(recovered.accounts[0].error,undefined)
  assert.deepEqual(recovered.accounts[0].requestErrors??[],[])
  assert.deepEqual(recovered.errors,{})
})

test('mixed account outcomes do not contaminate healthy-account status or successful-read time',async()=>{
  const cached=previous()
  const result=await c.loadAccounts({...config,accountIDs:[1,2]},auth,async url=>{
    if(url.endsWith('/accounts/1'))return http(500)
    return goodFetch(url)
  },[cached])
  assert.equal(result.accounts[0].fetchedAt,cached.fetchedAt)
  assert.equal(result.accounts[0].error,'服务器暂不可用（500）')
  assert.equal(result.accounts[1].error,undefined)
  assert.deepEqual(result.accounts[1].requestErrors??[],[])
  assert.deepEqual(Object.keys(result.errors),['1'])
  assert.equal(d.oldestSuccessfulRead(result.accounts),cached.fetchedAt)
})

test('malformed success bodies and thrown JSON errors are reported safely',async()=>{
  for(const response of [
    {ok:true,status:200,json:async()=>{throw new Error(`服务器 ${secret}`)}},
    {ok:true,status:200,json:async()=>null},
    {ok:true,status:200,json:async()=>({code:1,error:secret})},
    ok({id:2,name:secret,platform:'openai'})
  ]){
    const result=await c.loadAccounts(config,auth,async()=>response)
    assert.ok(result.errors['1'])
    assert.equal(result.accounts[0].fetchedAt,'')
    assert.ok(!JSON.stringify(result).includes(secret))
  }
})

test('cached partial failure details survive a whitelist roundtrip without retaining raw responses',async()=>{
  const result=await c.loadAccounts(config,auth,async url=>isAccount(url)?ok(raw()):http(503))
  const account=assertReported(result,1,'服务器暂不可用（503）')
  const cached=m.validateCachedAccount({...account,rawResponse:{token:secret},debugError:secret})
  assert.deepEqual(cached.requestErrors,account.requestErrors)
  assert.equal(cached.error,undefined)
  assert.equal(cached.fetchedAt,account.fetchedAt)
  assert.ok(!JSON.stringify(cached).includes(secret))
})

test('account request summaries separate current and previous success, partial failure, fallback, and no data',()=>{
  const account=previous()
  assert.equal(d.accountRequestStatus(account),'上次请求成功')
  assert.equal(d.accountRequestStatus(account,true),'本次请求成功')
  assert.equal(d.accountRequestStatus({...account,fetchedAt:''}),'尚未请求')
  assert.equal(d.accountRequestStatus({...account,error:'网络连接失败'},true),'本次请求失败：网络连接失败 · 旧快照')
  assert.equal(d.accountRequestStatus({...account,fetchedAt:'',error:'网络连接失败'},true),'本次请求失败：网络连接失败 · 暂无可用数据')
  assert.equal(d.accountRequestStatus({...account,requestErrors:['用量统计：网络连接失败']},true),'本次部分请求失败：用量统计：网络连接失败')
})

test('cache validation sanitizes both primary and scoped error strings instead of preserving token-bearing prefixes',()=>{
  const cached=m.validateCachedAccount({...previous(),error:`服务器 ${secret}`,requestErrors:[`账号：账号响应不匹配 ${secret}`,`用量统计：服务器暂不可用（503） ${secret}`,`7d 边界记录：timeout ${secret}`,secret,42]})
  assert.equal(cached.error,'网络连接失败')
  assert.ok(cached.requestErrors.every(error=>typeof error==='string'))
  assert.ok(!JSON.stringify(cached).includes(secret))
})
