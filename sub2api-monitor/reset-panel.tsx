import {Section,Text,Button,VStack,HStack,Spacer,Script,Widget,useState,fetch} from 'scripting'
import {makeDemo,type Config} from './model'
import {type Auth} from './client'
import {readConfig,AUTH_KEY,CACHE_KEY} from './state'
import {inspectResetAccount,prepareReset,executeReset,acknowledgeReceipt,receiptKey,validateReceipt,type ResetAccount,type ReceiptStore,type Receipt} from './operations'
const store:ReceiptStore={
 read:key=>{const value=Keychain.get(key);if(value===null)return null;try{return validateReceipt(JSON.parse(value))}catch{throw new Error('本机操作记录无法校验，请先核对后台，勿重复重置')}},
 write:(key,value)=>Keychain.set(key,JSON.stringify(value),{accessibility:'first_unlock_this_device',synchronizable:false})
}
function savedConnection():{config:Config;auth:Auth}{
 const config=readConfig();if(config.demo)throw new Error('请先保存真实服务器与管理凭证')
 let value:Auth&{baseURL:string;revision:string};try{const raw=Keychain.get(AUTH_KEY);if(!raw)throw new Error();value=JSON.parse(raw)}catch{throw new Error('请重新保存管理凭证')}
 if(!value||value.baseURL!==config.baseURL||value.revision!==config.revision||!value.token||!['jwt','apiKey'].includes(value.kind))throw new Error('凭证和设置不匹配，请重新保存')
 return {config,auth:{kind:value.kind,token:value.token}}
}
function receiptSummary(receipt:Receipt|null):string{
 if(!receipt)return '尚无本机重置记录'
 if(receipt.status==='acknowledged')return '上次记录已人工核对'
 if(receipt.status==='succeeded')return `重置已完成：${receipt.windowsReset??'未知'} 个窗口${receipt.warning?'；'+receipt.warning:''}`
 return '操作待核对：可能已经消耗重置券，禁止直接重试'
}
let panelBusy=false
export function ResetPanel(){
 const [accounts,setAccounts]=useState<ResetAccount[]>([])
 const [message,setMessage]=useState('先读取已保存配置中的账号。只读查询不会触发重置。')
 const [busy,setBusy]=useState(false)
 const [receipts,setReceipts]=useState<Record<string,Receipt|null>>({})
 const hintedID=String(Script.queryParameters?.accountID||'')
 async function load(){if(panelBusy)return;panelBusy=true;setBusy(true);try{
  const config=readConfig()
  if(config.demo){setAccounts(makeDemo().map(account=>({account,eligible:false,reason:'演示账号不能执行操作'})));setMessage('演示视图：重置操作不可用。');return}
  const connection=savedConnection();const results:ResetAccount[]=[];const records:Record<string,Receipt|null>={}
  for(const id of connection.config.accountIDs){try{results.push(await inspectResetAccount(connection.config,connection.auth,id,fetch));records[String(id)]=store.read(receiptKey(connection.config.baseURL,id))}catch{setMessage(`账号 #${id} 读取失败或操作记录不可用，请检查设置`)} }
  setAccounts(results);setReceipts(records);setMessage(`已读取 ${results.length} 个账号；重置券仍是服务器缓存，不保证实时可用。`)
 }catch(e){setMessage(e instanceof Error?e.message:'读取失败')}finally{panelBusy=false;setBusy(false)}}
 async function reset(id:number){if(panelBusy)return;panelBusy=true;setBusy(true);try{
  const connection=savedConnection()
  const prepared=await prepareReset(connection.config,connection.auth,id,fetch,store)
  const confirmed=await Dialog.confirm({title:'确认消耗 1 次 Codex 重置券',message:`服务器：${prepared.server}\n账号：${prepared.accountName} (#${prepared.accountID})\n缓存券数：${prepared.cachedCredits??'未知'}\n\n此操作会不可撤销地消耗 1 次重置券，重置服务器支持的额度窗口，并可能恢复账号限流状态、刷新缓存。不会只重置你指定的某个窗口。\n\n请求结果不确定时不会自动重试。确定现在执行一次？`,cancelLabel:'取消',confirmLabel:'消耗 1 次并重置'})
  if(!confirmed){setMessage('已取消，未发送重置请求。');return}
  // Same immutable connection/preparation pair; current saved config must still match.
  const current=savedConnection();if(current.config.revision!==connection.config.revision||current.config.baseURL!==connection.config.baseURL)throw new Error('设置已变化，请重新确认')
  const receipt=await executeReset(prepared,connection.config,connection.auth,fetch,store)
  setReceipts({...receipts,[String(id)]:receipt});setMessage(receiptSummary(receipt));Storage.set(CACHE_KEY,null);Widget.reloadAll()
 }catch(e){setMessage(e instanceof Error?e.message:'无法执行，请先检查后台结果')}finally{panelBusy=false;setBusy(false)}}
 async function acknowledge(id:number){if(panelBusy)return;panelBusy=true;setBusy(true);try{
  const {config}=savedConnection()
  const agreed=await Dialog.confirm({title:'已在管理后台核对？',message:`账号 #${id}\n请先在 Sub2API 后台核对重置结果和券数。本机不能根据旧快照判断是否消耗。\n\n只有确认已核对，才解除本机防重复锁。解除后不会自动发送请求；下次操作仍需重新确认。`,cancelLabel:'还未核对',confirmLabel:'已核对，解除本机锁'})
  if(!agreed)return
  if(!acknowledgeReceipt(config.baseURL,id,store))throw new Error('记录未解锁，请稍后再试')
  setReceipts({...receipts,[String(id)]:store.read(receiptKey(config.baseURL,id))});setMessage('已解除本机锁；没有发送重置请求。')
 }catch(e){setMessage(e instanceof Error?e.message:'无法更新记录')}finally{panelBusy=false;setBusy(false)}}
 return <Section header={<Text>Codex 重置中心 · 手动确认</Text>}>
  <Text>所有请求只发送到你配置的 Sub2API。小组件不会后台重置。重置将消耗 1 次券且不可撤销。</Text>
  {hintedID?<Text>小组件选择了账号 #{hintedID}。请先读取账号，再核对下方对应账号。</Text>:null}
  <Button title={busy?'正在处理，请勿重复点击':'读取账号与重置券（只读）'} action={load}/>
  {accounts.map(({account:a,eligible,reason})=><VStack key={String(a.id)} alignment="leading" spacing={6} padding={6}>
    <HStack><Text font="headline">{a.name}</Text><Spacer/><Text>#{a.id}</Text></HStack>
    <Text>{a.provider} · {a.status} · 重置券缓存：{a.resetCredits?.available??'未知'}{a.resetCredits?.expiresAt?` · 最近到期 ${new Date(a.resetCredits.expiresAt).toLocaleString()}`:''}</Text>
    <Text>{receiptSummary(receipts[String(a.id)]||null)}</Text>
    {eligible?<Button title={busy?'处理中…':'核对并重置一次…'} action={()=>reset(a.id)}/>:<Text>{reason}</Text>}
    {receipts[String(a.id)]&&receipts[String(a.id)]?.status!=='acknowledged'?<Button title="我已核对后台结果，解除本机锁…" action={()=>acknowledge(a.id)}/>:null}
  </VStack>)}
  <Text>{message}</Text>
 </Section>
}
