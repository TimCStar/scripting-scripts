// Executes the real TSX panel with state hooks and passive refresh doubles.
// Verifies lifecycle and rendered text, not native SwiftUI layout or device APIs.
const ts=require('typescript'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict')
const start=Date.parse('2026-10-10T12:00:00Z')
const account=(id,patch={})=>({id,name:`Account ${id}`,provider:'openai',groups:[],status:'active',windows:[{label:'7d',percent:25,updatedAt:new Date(start-7200000).toISOString(),resetsAt:new Date(start+86400000).toISOString()}],todayCost:null,todayTokens:null,estimate:'',fetchedAt:new Date(start).toISOString(),...patch})
function createHost({demo=false,ids=[1],cached=[],handler}={}){
  let config={version:1,demo,baseURL:'https://example.org',revision:'r1',accountIDs:ids,refreshMinutes:20,staleMinutes:60,displayNames:{1:'Work account'}}
  const state=[],calls=[],events=[],modules={};let cursor=0
  const identity=value=>`${value.baseURL}|${value.revision}|${value.accountIDs.join(',')}|${value.demo}`
  const fetch=()=>{throw Error('The panel must use the bounded passive refresh path')}
  const bridge={fetch,Section:'Section',Text:'Text',Button:'Button',VStack:'VStack',Widget:{reloadAll:()=>events.push('reload')},useState(initial){const slot=cursor++;if(!(slot in state))state[slot]=initial;return [state[slot],value=>{state[slot]=value}]}}
  const stored={readConfig:()=>config,readCache:()=>({accounts:cached}),identity}
  const refresh={refreshMonitor:async(params,fetcher)=>{assert.equal(fetcher,fetch);calls.push(JSON.parse(JSON.stringify(params)));return handler?handler(params,calls.length):{status:'ok',accounts:params.accountIDs.map(id=>account(id))}}}
  const jsx=(type,props,...children)=>typeof type==='function'?type({...props,children}):{type,props:props||{},children:children.flat(Infinity).filter(x=>x!==null&&x!==undefined&&x!==false)}
  function load(file){
    file=path.resolve(file);if(modules[file])return modules[file].exports
    const module={exports:{}};modules[file]=module
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText
    const require=name=>name==='scripting'?bridge:name==='./state'?stored:name==='./refresh'?refresh:load(path.resolve(path.dirname(file),name)+(fs.existsSync(path.resolve(path.dirname(file),name)+'.ts')?'.ts':'.tsx'))
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{jsx,Date,console},{filename:file})(require,module,module.exports)
    return module.exports
  }
  const panel=load('connection-panel.tsx')
  return {
    calls,events,identity,
    get config(){return config},
    setConfig(patch){config={...config,...patch}},
    render(){
      cursor=0;const view=panel.ConnectionPanel(),texts=[],buttons=[]
      function walk(node){if(!node||typeof node!=='object')return;if(node.type==='Text')texts.push(node.children.join(''));if(node.type==='Button')buttons.push(node);for(const child of node.children||[])walk(child)}
      walk(view);assert.equal(buttons.length,1)
      return {view,texts,button:buttons[0]}
    }
  }
}
async function run(){
  {
    const host=createHost({demo:true}),before=host.render()
    assert.ok(before.texts.includes('未配置真实连接 · 演示模式'))
    assert.equal(host.calls.length,0)
    await before.button.props.action()
    assert.equal(host.calls.length,0,'Demo state must never send a server request')
    assert.equal(host.events.length,0)
  }
  {
    const host=createHost(),before=host.render()
    assert.ok(before.texts.includes('已配置 · 尚未请求'))
    assert.equal(host.calls.length,0,'Rendering the panel must not launch a network check')
    await before.button.props.action()
    const after=host.render()
    assert.equal(host.calls.length,1)
    assert.deepEqual(host.calls[0],{identity:host.identity(host.config),accountIDs:[1]})
    assert.ok(after.texts.includes('本次连接成功 · 已读取 1 个账号'))
    assert.ok(after.texts.includes('本次请求成功'))
    assert.ok(after.texts.includes('Work account · #1'))
    assert.ok(after.texts.some(text=>text.startsWith('上次成功读取账号：')))
    assert.ok(after.texts.some(text=>text.startsWith('7d 服务器采样：')))
    assert.deepEqual(host.events,['reload'])
  }
  {
    const host=createHost({cached:[account(1,{error:'网络连接失败'}),account(2,{fetchedAt:'',error:'管理凭证失效或权限不足'}),account(3,{requestErrors:['用量统计：服务器暂不可用（503）']})]})
    const before=host.render()
    assert.ok(before.texts.includes('上次请求状态见下方；尚未执行本次检查'))
    assert.ok(before.texts.includes('上次请求失败：网络连接失败 · 旧快照'))
    assert.ok(before.texts.includes('上次请求失败：管理凭证失效或权限不足 · 暂无可用数据'))
    assert.ok(before.texts.includes('上次部分请求失败：用量统计：服务器暂不可用（503）'))
    assert.equal(host.calls.length,0)
    await before.button.props.action()
    const after=host.render()
    assert.ok(after.texts.includes('本次请求成功'))
    assert.ok(!after.texts.some(text=>/^(本次|上次).*(旧快照|网络连接失败|权限不足|503)/.test(text)),'A recovery replaces all old failure details')
  }
  {
    const host=createHost({ids:Array.from({length:9},(_,i)=>i+1)})
    await host.render().button.props.action()
    assert.deepEqual(host.calls.map(call=>call.accountIDs),[[1,2,3,4],[5,6,7,8],[9]])
    assert.ok(host.calls.every(call=>call.identity===host.identity(host.config)))
    const after=host.render()
    assert.ok(after.texts.includes('本次连接成功 · 已读取 9 个账号'))
    assert.equal(after.texts.filter(text=>text==='本次请求成功').length,9)
    assert.deepEqual(host.events,['reload'],'Only reload widgets once after all bounded chunks finish')
  }
  {
    let release;const pending=new Promise(resolve=>{release=resolve})
    const host=createHost({handler:async params=>{await pending;return {status:'ok',accounts:params.accountIDs.map(id=>account(id))}}})
    const action=host.render().button.props.action,first=action()
    assert.ok(host.render().texts.includes('正在连接并读取…'))
    assert.equal(host.render().button.props.title,'正在读取…')
    await action()
    assert.equal(host.calls.length,1,'Double taps must not overlap request runs')
    release();await first
    assert.equal(host.render().button.props.title,'刷新连接状态与数据（只读）')
    assert.deepEqual(host.events,['reload'])
  }
  {
    const host=createHost({ids:[1,2],handler:async()=>({status:'partial',accounts:[account(1,{requestErrors:['用量统计：网络请求超时']}),account(2,{error:'网络连接失败'})]})})
    await host.render().button.props.action()
    const after=host.render()
    assert.ok(after.texts.includes('本次部分请求失败'))
    assert.ok(after.texts.includes('本次部分请求失败：用量统计：网络请求超时'))
    assert.ok(after.texts.includes('本次请求失败：网络连接失败 · 旧快照'))
    assert.ok(!after.texts.some(text=>text.startsWith('本次连接成功')))
    assert.deepEqual(host.events,['reload'])
  }
  {
    const host=createHost({handler:async()=>({status:'failed',notice:'未找到当前配置的管理凭证',accounts:[account(1,{fetchedAt:'',error:'管理凭证失效或权限不足'})]})})
    await host.render().button.props.action()
    const after=host.render()
    assert.ok(after.texts.includes('本次连接或请求失败：未找到当前配置的管理凭证'))
    assert.ok(after.texts.includes('本次请求失败：管理凭证失效或权限不足 · 暂无可用数据'))
    assert.deepEqual(host.events,['reload'])
  }
  {
    const host=createHost({handler:async()=>({status:'failed',notice:'缓存保存失败',accounts:[account(1)]})})
    await host.render().button.props.action()
    const after=host.render()
    assert.ok(after.texts.includes('本次连接成功 · 缓存保存失败'))
    assert.ok(after.texts.includes('本次请求成功'))
    assert.ok(!after.texts.some(text=>text.startsWith('本次部分请求失败')||text.startsWith('本次连接或请求失败')),'A storage failure must not masquerade as a connection failure')
    assert.deepEqual(host.events,['reload'])
  }
  {
    let failures=1
    const host=createHost({handler:async params=>{if(failures-- > 0)throw Error('SECRET_RAW_ERROR');return {status:'ok',accounts:params.accountIDs.map(id=>account(id))}}})
    await host.render().button.props.action()
    const failed=host.render()
    assert.ok(failed.texts.includes('本次读取失败，请重试'))
    assert.ok(!failed.texts.join(' ').includes('SECRET_RAW_ERROR'))
    assert.equal(failed.button.props.title,'刷新连接状态与数据（只读）')
    await failed.button.props.action()
    assert.equal(host.calls.length,2,'An exception must release the in-flight guard')
    assert.ok(host.render().texts.includes('本次连接成功 · 已读取 1 个账号'))
  }
  for(const outcome of ['config-change','discarded','ignored']){
    let release;const pending=new Promise(resolve=>{release=resolve})
    const host=createHost({ids:[1,2,3,4,5],cached:[account(1)],handler:async params=>{await pending;return {status:outcome==='config-change'?'ok':outcome,accounts:params.accountIDs.map(id=>account(id))}}})
    const running=host.render().button.props.action()
    if(outcome==='config-change')host.setConfig({revision:'r2'})
    release();await running
    const after=host.render()
    assert.ok(after.texts.includes('配置已改变，请重新读取'))
    assert.ok(!after.texts.some(text=>/ · #\d+$/.test(text)),'Obsolete accounts must not survive a config mismatch')
    assert.equal(host.calls.length,1,'Do not request another chunk after configuration becomes obsolete')
    assert.equal(host.events.length,0)
    assert.equal(after.button.props.title,'刷新连接状态与数据（只读）')
  }
  console.log('12 mocked connection-panel lifecycle checks passed. No native rendering or device verification.')
}
run().catch(error=>{console.error(error);process.exitCode=1})
