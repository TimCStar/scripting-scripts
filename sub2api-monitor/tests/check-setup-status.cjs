// Mock hook execution of the real setup form. No real credentials or requests.
const ts=require('typescript'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict')
function host({handler,credential=true}={}){
  const config={version:1,demo:false,baseURL:'https://example.org',revision:'r1',accountIDs:[1],refreshMinutes:20,staleMinutes:60}
  const state=[],calls=[],modules={};let cursor=0
  const fetch=()=>{throw Error('Unexpected direct fetch')}
  const bridge={fetch,Navigation:{useDismiss:()=>()=>{}},Widget:{reloadAll:()=>{throw Error('Read-only tests must not reload or save')},preview:()=>{}},Script:{}}
  for(const name of ['HStack','NavigationStack','Form','Section','TextField','SecureField','Button','Text','Picker'])bridge[name]=name
  bridge.useState=initial=>{const slot=cursor++;if(!(slot in state))state[slot]=initial;return [state[slot],value=>{state[slot]=value}]}
  const jsx=(type,props,...children)=>typeof type==='function'?type({...props,children}):{type,props:props||{},children:children.flat(Infinity).filter(x=>x!==null&&x!==undefined&&x!==false)}
  const stored={readConfig:()=>config,AUTH_KEY:'auth',CONFIG_KEY:'config',CACHE_KEY:'cache'}
  const client={loadAccounts:async(selected,auth,fetcher)=>{assert.equal(fetcher,fetch);calls.push({selected,auth});return handler?handler(selected,auth):{accounts:selected.accountIDs.map(id=>({id,fetchedAt:'2026-10-10T12:00:00Z'})),errors:{}}}}
  const keychain={get:()=>credential?JSON.stringify({kind:'apiKey',token:'TEST_TOKEN_NEVER_DISPLAY',baseURL:config.baseURL}):null,set:()=>{throw Error('Read-only tests must not write keychain')}}
  const storage={set:()=>{throw Error('Read-only tests must not save config or cache')}}
  const globals={jsx,Date,console,Keychain:keychain,Storage:storage}
  function load(file){
    file=path.resolve(file);if(modules[file])return modules[file].exports
    const module={exports:{}};modules[file]=module
    let source=fs.readFileSync(file,'utf8')
    if(file.endsWith('/index.tsx'))source=source.replace(/run\(\)\s*$/,'module.exports.Setup=Setup')
    const code=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText
    const require=name=>name==='scripting'?bridge:name==='./state'?stored:name==='./client'?client:name==='./connection-panel'?{ConnectionPanel:()=>null}:name==='./reset-panel'?{ResetPanel:()=>null}:name==='./provider-icons'?{preloadProviderIcons:()=>({images:{},failed:[]}),ProviderIcon:()=>null}:load(path.resolve(path.dirname(file),name)+'.ts')
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`,globals,{filename:file})(require,module,module.exports)
    return module.exports
  }
  const {Setup}=load('index.tsx')
  return {calls,render(){
    cursor=0;const view=Setup(),nodes=[]
    function walk(n){if(!n||typeof n!=='object')return;nodes.push(n);for(const child of n.children||[])walk(child)}walk(view)
    const texts=nodes.filter(n=>n.type==='Text').map(n=>n.children.join(''))
    assert.ok(!texts.join(' ').includes('TEST_TOKEN_NEVER_DISPLAY'))
    return {texts,status:texts.find(text=>text.startsWith('当前输入测试：')),testButton:nodes.find(n=>n.type==='Button'&&['测试连接（只读）','正在读取…'].includes(n.props.title)),field:title=>nodes.find(n=>['TextField','SecureField','Picker'].includes(n.type)&&n.props.title===title)}
  }}
}
async function run(){
  {
    const h=host(),initial=h.render()
    assert.equal(initial.status,'当前输入测试：尚未测试当前输入')
    assert.equal(h.calls.length,0)
    await initial.testButton.props.action()
    assert.equal(h.render().status,'当前输入测试：本次连接成功，已读取 1 个账号。请再点保存。')
    assert.equal(h.calls[0].auth.token,'TEST_TOKEN_NEVER_DISPLAY')
    assert.deepEqual(Array.from(h.calls[0].selected.accountIDs),[1])
  }
  for(const [title,value] of [['HTTPS 地址','https://other.example.org'],['账号 ID（依显示顺序）','1,2'],['凭证类型','jwt'],['管理凭证（留空保留）','REPLACEMENT_TOKEN']]){
    const h=host();await h.render().testButton.props.action()
    h.render().field(title).props.onChanged(value)
    assert.equal(h.render().status,'当前输入测试：输入已改变，请重新测试',title)
  }
  {
    let release;const pending=new Promise(resolve=>{release=resolve})
    const h=host({handler:async()=>{await pending;return {accounts:[{id:1}],errors:{}}}})
    const running=h.render().testButton.props.action()
    assert.equal(h.render().status,'当前输入测试：正在连接并读取…')
    assert.equal(h.render().testButton.props.title,'正在读取…')
    h.render().field('账号 ID（依显示顺序）').props.onChanged('1,2')
    release();await running
    assert.equal(h.render().status,'当前输入测试：输入已改变，请重新测试','An old response cannot label new inputs successful')
    assert.equal(h.render().testButton.props.title,'测试连接（只读）')
  }
  {
    const h=host({handler:async()=>({accounts:[{id:1,requestErrors:['用量统计：网络连接失败']}],errors:{1:'用量统计：网络连接失败'}})})
    await h.render().testButton.props.action()
    assert.equal(h.render().status,'当前输入测试：本次部分请求失败：\n账号 #1：用量统计：网络连接失败')
  }
  {
    const h=host({handler:async()=>({accounts:[{id:1,error:'管理凭证失效或权限不足',fetchedAt:''}],errors:{1:'管理凭证失效或权限不足'}})})
    await h.render().testButton.props.action()
    assert.equal(h.render().status,'当前输入测试：本次连接或请求失败：\n账号 #1：管理凭证失效或权限不足')
  }
  {
    const h=host({credential:false})
    await h.render().testButton.props.action()
    assert.equal(h.calls.length,0)
    assert.equal(h.render().status,'当前输入测试：本次连接检查失败：请填写管理员 API Key 或 JWT')
    assert.equal(h.render().testButton.props.title,'测试连接（只读）')
  }
  {
    const h=host()
    h.render().field('账号 ID（依显示顺序）').props.onChanged('1,2,3,4,5')
    await h.render().testButton.props.action()
    assert.deepEqual(Array.from(h.calls[0].selected.accountIDs),[1,2,3,4],'The input test retains the existing four-account request bound')
  }
  console.log('10 mocked setup request-status checks passed. No native rendering or device verification.')
}
run().catch(error=>{console.error(error);process.exitCode=1})
