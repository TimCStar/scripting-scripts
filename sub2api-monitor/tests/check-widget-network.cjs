// Actual widget module, mocked independent execution hosts. No device verification.
const ts=require('typescript'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict')
const root=process.cwd(),start=Date.parse('2026-10-10T12:00:00Z')
const config={version:1,demo:false,baseURL:'https://example.org',revision:'r1',accountIDs:[101],refreshMinutes:20,staleMinutes:60}
const credential=JSON.stringify({baseURL:config.baseURL,revision:config.revision,kind:'apiKey',token:'fixture-only'})
async function render({offline=false,saveFails=false,changeAuth=false,initialCache}={}) {
  let clock=start,auth=credential;const modules={},calls=[],writes=[],result={}
  class Clock extends Date { constructor(...args){super(...(args.length?args:[clock]))} static now(){return clock} }
  const jsx=(type,props,...children)=>typeof type==='function'?type({...props,children}):{type,props:props||{},children:children.flat(Infinity).filter(x=>x!==null&&x!==undefined&&x!==false)}
  const data=new Map([['sub2api.config.v1',config],['sub2api.cache.v1',initialCache]])
  const bridge={AppIntentProtocol:{AppIntent:'AppIntent'},AppIntentManager:{register:d=>p=>({definition:d,params:p})},Script:{directory:'/missing-assets',name:'Sub2API',createRunSingleURLScheme:()=> 'scripting://review'},Widget:{family:'systemSmall',displaySize:{width:155,height:155},parameter:'101',present(view,policy){result.view=view;result.policy=policy}},fetch:async(url,init)=>{
    calls.push({url,init});assert.equal(init.method,'GET');assert.equal(await init.handleRedirect(),null);assert.ok(!/reset|\/quota|\/accounts\/\d+\/usage|refresh-token/.test(url));
    await Promise.resolve();clock+=1000;if(changeAuth)auth=null;if(offline)throw Error('fixture offline');
    return {ok:true,status:200,json:async()=>({code:0,data:url.includes('/accounts/')?{id:101,name:'Fresh account',platform:'openai',status:'active',extra:{}}:{total_account_cost:2}})}} }
  for(const name of ['VStack','HStack','Text','Spacer','ProgressView','Link','Image','Button'])bridge[name]=name
  const globals={jsx,console,Date:Clock,JSON,Path:{join:(...xs)=>xs.join('/')},Storage:{get:k=>data.get(k),set:(k,v)=>{writes.push({k,v});if(saveFails)return false;data.set(k,v);return true}},Keychain:{get:()=>auth},UIImage:{fromBase64String:()=>({decoded:true}),fromFile:()=>null}}
  function load(file){file=path.resolve(file);if(modules[file])return modules[file].exports;const module={exports:{}};modules[file]=module;let source=fs.readFileSync(file,'utf8');if(file.endsWith('/widget.tsx'))source=source.replace(/run\(\)\s*$/, 'globalThis.completion=run()');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText;const require=name=>name==='scripting'?bridge:load(path.resolve(path.dirname(file),name)+(fs.existsSync(path.resolve(path.dirname(file),name)+'.ts')?'.ts':'.tsx'));vm.runInNewContext(`(function(require,module,exports){${code}\n})`,globals,{filename:file})(require,module,module.exports);return module.exports}
  load(path.join(root,'widget.tsx'));await globals.completion;assert.ok(result.view);const texts=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='Text')texts.push(n.children.join(''));for(const c of n.children||[])walk(c)}walk(result.view)
  return {...result,calls,writes,texts,cache:data.get('sub2api.cache.v1'),clock}
}
;(async()=>{
  const first=await render();assert.ok(first.texts.includes('今日用量：— / $2.00'),'Fresh today amount must use postfetch render time');assert.equal(first.calls.length,2);assert.equal(first.policy.date.getTime(),first.clock+20*60000)
  const old=JSON.parse(JSON.stringify(first.cache));old.accounts[0].name='Old cache';old.accounts[0].fetchedAt=new Date(start-60000).toISOString();delete old.accounts[0].readStartedAt;old.accounts[0].todayCost=1
  const fresh=await render({initialCache:old});assert.equal(fresh.calls.length,2,'Fresh cache never suppresses server reads');assert.ok(fresh.texts.includes('Fresh account'));assert.ok(fresh.texts.includes('今日用量：— / $2.00'))
  const secondHost=await render({initialCache:old});assert.equal(secondHost.calls.length,2,'Separate host with lagging Storage independently rereads');assert.ok(secondHost.texts.includes('Fresh account'))
  const failed=await render({offline:true,initialCache:old});assert.ok(failed.texts.includes('Old cache'));assert.equal(failed.cache.accounts[0].fetchedAt,old.accounts[0].fetchedAt);assert.ok(failed.texts.includes('请求失败 · 旧快照'));assert.ok(failed.texts.includes('今日用量：— / —'))
  const disk=await render({saveFails:true,initialCache:old});assert.ok(disk.texts.includes('缓存保存失败'));assert.ok(disk.texts.includes('今日用量：— / $2.00'));assert.equal(disk.cache,old)
  const changed=await render({changeAuth:true,initialCache:old});assert.ok(!changed.texts.includes('Old cache'));assert.ok(!changed.texts.includes('Fresh account'));assert.ok(changed.texts.includes('配置已改变，请重新载入小组件'));assert.equal(changed.writes.length,0)
  console.log('6 async widget network-host checks passed. No native device verification.')
})().catch(e=>{console.error(e);process.exitCode=1})
