// Mock host execution, not a device App Intent test.
const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict')
const code=ts.transpileModule(fs.readFileSync('app_intents.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
async function check(fails){
  const events=[],module={exports:{}};let definition,release
  const pending=new Promise(resolve=>{release=resolve})
  const selection={accountIDs:[101],identity:'fixture'}
  const fetch=()=>{throw Error('Unexpected real network')}
  const bridge={fetch,AppIntentProtocol:{AppIntent:'AppIntent'},AppIntentManager:{register:d=>{definition=d;return params=>({params})}},Widget:{reloadAll:()=>events.push('reload')}}
  const refresh={refreshMonitor:async(params,fetcher)=>{assert.equal(params,selection);assert.equal(fetcher,fetch);events.push('fetch');await pending;if(fails)throw Error('fixture');events.push('saved')}}
  vm.runInNewContext(`(function(require,module,exports){${code}})`,{console})(name=>name==='scripting'?bridge:refresh,module,module.exports)
  assert.equal(definition.protocol,'AppIntent');assert.equal(definition.name,'RefreshMonitorIntent')
  const performed=definition.perform(selection);assert.deepEqual(events,['fetch']);release()
  if(fails)await assert.rejects(performed);else await performed
  assert.deepEqual(events,fails?['fetch','reload']:['fetch','saved','reload'])
}
;(async()=>{await check(false);await check(true);console.log('2 mock App Intent lifecycle checks passed. No device verification.')})().catch(error=>{console.error(error);process.exitCode=1})
