import { HStack, Navigation, NavigationStack, Form, Section, TextField, SecureField, Button, Text, Script, Widget, Picker, useState, fetch } from 'scripting'
import { normalizeBaseURL, parseIDs, type Config } from './model'
import { loadAccounts, type Auth } from './client'
import { readConfig, CONFIG_KEY, AUTH_KEY, CACHE_KEY } from './state'
import {ConnectionPanel} from './connection-panel'
import {ResetPanel} from './reset-panel'
import {parseDisplayNames} from './display'
import {ProviderIcon,preloadProviderIcons} from './provider-icons'

const artwork=preloadProviderIcons()
let inputRevision=0

function Setup() {
  const initial = readConfig()
  const dismiss = Navigation.useDismiss()
  const [url,setURL] = useState(initial.baseURL)
  const [ids,setIDs] = useState(initial.accountIDs.join(','))
  const [kind,setKind] = useState<'apiKey'|'jwt'>('apiKey')
  const [token,setToken] = useState('')
  const [names,setNames] = useState<Record<string,string>>(initial.displayNames || {})
  const [fiveHour,setFiveHour] = useState<Record<string,'auto'|'show'|'hide'>>(initial.fiveHourVisibility || {})
  const editorIDs=ids.trim().split(/[,，\s]+/).filter((id,i,all)=>/^[1-9]\d*$/.test(id)&&Number.isSafeInteger(Number(id))&&all.indexOf(id)===i).slice(0,12)
  const [message,setMessage] = useState('凭证仅写入本机钥匙串。空白表示保留现有凭证。')
  const [busy,setBusy] = useState(false)
  const [panelRevision,setPanelRevision] = useState(0)
  const [testStatus,setTestStatus] = useState('尚未测试当前输入')
  function config():Config {return {version:1,baseURL:normalizeBaseURL(url),accountIDs:parseIDs(ids),demo:false,refreshMinutes:20,staleMinutes:60,displayNames:parseDisplayNames(JSON.stringify(Object.fromEntries(Object.entries(names).filter(([id,name])=>editorIDs.includes(id)&&name.trim())))),fiveHourVisibility:fiveHour,revision:String(Date.now())}}
  function auth():Auth {
    if (token.trim()) return {kind,token:token.trim()}
    let saved:string|null;try{saved=Keychain.get(AUTH_KEY)}catch{throw new Error('无法读取本机管理凭证')}
    if (!saved) throw new Error('请填写管理员 API Key 或 JWT')
    let old:Auth & {baseURL:string};try{old=JSON.parse(saved)}catch{throw new Error('已存凭证格式无效，请重新填写')}
    if(!old || typeof old.token!=='string' || !old.token || !['apiKey','jwt'].includes(old.kind))throw new Error('已存凭证格式无效，请重新填写')
    if (old.baseURL !== normalizeBaseURL(url)) throw new Error('更换服务器时必须重新填写凭证')
    return {kind:old.kind,token:old.token}
  }
  function preview(family:'systemSmall'|'systemMedium'|'systemLarge'){const c=readConfig();const ids=c.demo?[101,102,103,104]:c.accountIDs;const max=family==='systemSmall'?1:family==='systemLarge'?4:2;const options:Record<string,string>={'默认':''};for(let n=1;n<=Math.min(max,ids.length);n++)options[`${n} 个账号`]=ids.slice(0,n).join(',');return Widget.preview({family,parameters:{options,default:'默认'}})}
  return <NavigationStack><Form navigationTitle="Sub2API 用量看板" toolbar={{cancellationAction:<Button title="完成" action={dismiss}/>}}>
    <Section header={<Text>连接你的服务器</Text>}>
      <TextField title="HTTPS 地址" value={url} onChanged={value=>{inputRevision++;setURL(value);setTestStatus('输入已改变，请重新测试')}}/>
      <TextField title="账号 ID（依显示顺序）" value={ids} onChanged={value=>{inputRevision++;setIDs(value);setTestStatus('输入已改变，请重新测试')}}/>
      <Text>填写 Sub2API 上游账号的数字 ID，用逗号分隔。小号 1 个，中号可选 1–2 个，大号可选 1–4 个；少账号时自动放大。</Text>
      <Picker title="凭证类型" value={kind} onChanged={value=>{if(value==='apiKey'||value==='jwt'){inputRevision++;setKind(value);setTestStatus('输入已改变，请重新测试')}}}>
        <Text tag="apiKey">管理员 API Key</Text><Text tag="jwt">管理员 JWT</Text>
      </Picker>
      <SecureField title="管理凭证（留空保留）" value={token} onChanged={value=>{inputRevision++;setToken(value);setTestStatus('输入已改变，请重新测试')}}/>
      <Text>需要管理员权限；普通下游 API Key 不适用。不要把凭证放进脚本或小组件参数。</Text>
    </Section>
    {editorIDs.map(id=><Section key={id} header={<Text>账号 #{id}</Text>}>
        <TextField title="显示名称（留空使用服务器名称）" value={names[id]||''} onChanged={value=>setNames({...names,[id]:value})}/>
        <Picker title="5h 显示" value={fiveHour[id]||'auto'} onChanged={value=>{if(value==='auto'||value==='show'||value==='hide')setFiveHour({...fiveHour,[id]:value})}}>
          <Text tag="auto">自动（有快照时显示）</Text><Text tag="show">显示</Text><Text tag="hide">隐藏</Text>
        </Picker>
    </Section>)}
    <Section header={<Text>显示说明</Text>}>
      <Text>名称与显示设置仅保存在本机。你的账号没有 5h 限制时可选择隐藏；真实 0% 不会显示成告警。</Text>
      <Text>7d 下方显示窗口已用美元 / 估算总美元；按服务器记录计算当前 7d 窗口，并结合额度比例，不使用手动参考额度。缺失的数据会显示为 —。</Text>
    </Section>
    <Section header={<Text>保存与验证</Text>}>
      <Button title={busy ? '正在读取…' : '测试连接（只读）'} action={async()=>{
        if(busy)return;setBusy(true);setTestStatus('正在连接并读取…');const revision=inputRevision
        try {const c=config();const a=auth();const result=await loadAccounts({...c,accountIDs:c.accountIDs.slice(0,4)},a,fetch);if(inputRevision!==revision){setTestStatus('输入已改变，请重新测试');return}setTestStatus(Object.keys(result.errors).length?`本次${result.accounts.every(x=>x.error)?'连接或请求失败':'部分请求失败'}：\n`+result.accounts.map(x=>`账号 #${x.id}：${result.errors[String(x.id)] || '请求成功'}`).join('\n'):`本次连接成功，已读取 ${result.accounts.length} 个账号。请再点保存。`)}
        catch(e){setTestStatus(inputRevision!==revision?'输入已改变，请重新测试':'本次连接检查失败：'+(e instanceof Error?e.message:'无法读取连接设置'))}finally{setBusy(false)}
      }}/>
      <Button title="保存并启用真实数据" action={()=>{
        if(busy)return
        try {const c=config();const a=auth();if(!Keychain.set(AUTH_KEY,JSON.stringify({...a,baseURL:c.baseURL,revision:c.revision}),{accessibility:'first_unlock_this_device',synchronizable:false}))throw new Error('钥匙串保存失败，未启用'); if(!Storage.set(CONFIG_KEY,c))throw new Error('设置保存失败，请重试');Storage.set(CACHE_KEY,null);setToken('');setMessage('已保存。可预览，或在主屏幕添加 Scripting 小组件。');setPanelRevision(panelRevision+1);setTestStatus('配置已改变，请重新测试');Widget.reloadAll()}
        catch(e){setMessage(e instanceof Error?e.message:'保存失败')}
      }}/>
      <Button title="启用演示数据（不联网）" action={()=>{try{if(!Storage.set(CONFIG_KEY,{version:1,demo:true})){setMessage('演示模式保存失败，未切换，请重试。');return}Storage.set(CACHE_KEY,null);setToken('');setMessage('演示已启用，所有数值均为虚构。');setPanelRevision(panelRevision+1);setTestStatus('配置已改变，请重新测试');Widget.reloadAll()}catch{setMessage('无法保存演示模式，请解锁设备后重试。')}}}/>
      <Button title="移除本机凭证和缓存" action={()=>{try{const existed=Keychain.get(AUTH_KEY)!==null;const removed=Keychain.remove(AUTH_KEY);const cacheCleared=Storage.set(CACHE_KEY,null);const demoSaved=Storage.set(CONFIG_KEY,{version:1,demo:true});setToken('');setMessage(existed&&!removed?'钥匙串删除失败，请重试。':!cacheCleared||!demoSaved?'凭证已移除，但缓存或模式保存失败，请重试。':'本机凭证和缓存已移除，已切换演示模式。');setPanelRevision(panelRevision+1);setTestStatus('配置已改变，请重新测试');Widget.reloadAll()}catch{setMessage('无法访问本机存储，请解锁设备后重试。')}}}/>
      <Text>当前输入测试：{testStatus}</Text>
      <Text>{message}</Text>
    </Section>
    <ConnectionPanel key={String(panelRevision)}/>
    <ResetPanel/>
    <Section header={<Text>预览 · v1.2.3</Text>}>
      <HStack spacing={16}>{(['openai','anthropic','antigravity'] as const).map(provider=><ProviderIcon key={provider} provider={provider} size={28} images={artwork.images}/>)}</HStack>
      <Text>{artwork.failed.length?'图标解码失败：'+artwork.failed.join('、')+'。请更新 Scripting 后重试。':'离线图标已解码。上方应显示 3 个真实平台标志。'}</Text>
      <Button title="小号 · 单账号" action={()=>preview('systemSmall')}/>
      <Button title="中号 · 可选 1–2 个" action={()=>preview('systemMedium')}/>
      <Button title="大号 · 可选 1–4 个" action={()=>preview('systemLarge')}/>
      <Text>系统决定实际刷新时间。默认申请约 20 分钟后刷新；仅在连接或请求失败并沿用缓存时提示旧快照；不会把 0% 或采样时间较早当作连接告警。GPT / Claude 仅使用已有快照，不会发送模型请求。</Text>
    </Section>
  </Form></NavigationStack>
}
async function run(){await Navigation.present({element:<Setup/>});Script.exit()}
run()
