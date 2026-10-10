import {Section,Text,Button,VStack,useState,fetch,Widget} from 'scripting'
import type {AccountView} from './model'
import {readConfig,readCache,identity} from './state'
import {refreshMonitor} from './refresh'
import {accountRequestStatus,displayName,resetTime} from './display'

let reading=false
/** A request result, never a claim of a persistent/live network connection. */
export function ConnectionPanel(){
 const config=readConfig()
 const cached=readCache(config)?.accounts||[]
 const [accounts,setAccounts]=useState<AccountView[]>(cached)
 const [busy,setBusy]=useState(false)
 const [current,setCurrent]=useState(false)
 const [status,setStatus]=useState(config.demo?'未配置真实连接 · 演示模式':cached.length?'上次请求状态见下方；尚未执行本次检查':'已配置 · 尚未请求')
 async function refresh(){
  if(reading)return
  const selected=readConfig(),key=identity(selected)
  if(selected.demo){setStatus('未配置真实连接 · 演示模式');return}
  reading=true;setBusy(true);setCurrent(false);setStatus('正在连接并读取…')
  try{
   const next:AccountView[]=[],notices:string[]=[]
   let failed=false,partial=false
   for(let offset=0;offset<selected.accountIDs.length;offset+=4){
    const result=await refreshMonitor({identity:key,accountIDs:selected.accountIDs.slice(offset,offset+4)},fetch)
    if(identity(readConfig())!==key||result.status==='discarded'||result.status==='ignored'){
     setAccounts([]);setStatus('配置已改变，请重新读取');return
    }
    next.push(...result.accounts||[])
    if(result.notice&&!notices.includes(result.notice))notices.push(result.notice)
    failed ||= result.status==='failed';partial ||= result.status==='partial'
   }
   setAccounts(next);setCurrent(true)
   const anySuccess=next.some(a=>a.fetchedAt&&!a.error)
   const onlySaveFailed=notices.length===1&&notices[0]==='缓存保存失败'&&next.length===selected.accountIDs.length&&next.every(a=>!a.error&&!a.requestErrors?.length)
   setStatus(onlySaveFailed?'本次连接成功 · 缓存保存失败':failed||partial?`${anySuccess?'本次部分请求失败':'本次连接或请求失败'}${notices.length?'：'+notices.join('；'):''}`:`本次连接成功 · 已读取 ${next.length} 个账号`)
   Widget.reloadAll()
  }catch{setStatus('本次读取失败，请重试');setCurrent(false)}
  finally{reading=false;setBusy(false)}
 }
 return <Section header={<Text>连接与请求状态</Text>}>
  <Text>{status}</Text>
  <Button title={busy?'正在读取…':'刷新连接状态与数据（只读）'} action={refresh}/>
  {accounts.map(a=><VStack key={String(a.id)} alignment="leading" spacing={4}>
   <Text>{displayName(a,config.displayNames)} · #{a.id}</Text>
   <Text>{accountRequestStatus(a,current)}</Text>
   <Text>上次成功读取账号：{resetTime(a.fetchedAt)}</Text>
   {a.windows.map((w,i)=><Text key={String(i)}>{w.label} 服务器采样：{resetTime(w.updatedAt)}</Text>)}
  </VStack>)}
  <Text>状态仅表示本次或上次请求结果，不代表持续在线。小组件「更新于」是成功读取账号的时间；服务器采样时间独立显示，时间经过不会触发「旧快照」。只有连接或请求失败后沿用缓存时才显示「旧快照」。过期窗口和未能确认的金额仍显示为 —。</Text>
 </Section>
}
