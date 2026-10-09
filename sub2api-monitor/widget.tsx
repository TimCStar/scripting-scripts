import { Widget, VStack, HStack, Text, Spacer, ProgressView, Link, Script, fetch } from 'scripting'
import { brand, barPercent, isStale, relativeReset, makeDemo, selectWidgetIDs, widgetLayout, type AccountView, type Window, type Config, type Layout } from './model'
import {displayName,windowDollars,visibleWindows} from './display'
import {ProviderIcon} from './provider-icons'
import { loadAccounts, type Auth } from './client'
import { readConfig, readCache, saveCache, AUTH_KEY } from './state'
const foreground = {light:'#243B3A',dark:'#EDF2F0'}
const muted = {light:'#758580',dark:'#97A8A2'}
const warning = {light:'#A35A42',dark:'#E2A18B'}
const bg = {light:'#F5F7F4',dark:'#17201F'}
function cardBackground(provider:string){return provider==='anthropic'?{light:'#F3EAE2',dark:'#2D2420'}:provider==='antigravity'?{light:'#EBEDF6',dark:'#222639'}:{light:'#EAF1EC',dark:'#1D2B27'}}
const small = Widget.family === 'systemSmall'
const large = Widget.family === 'systemLarge'
const now = Date.now()
/** Stale snapshots are neutral metadata; 0% is never a warning by itself. */
function snapshotNote(w:Window,c:Config):string {
  if(w.resetsAt&&Date.parse(w.resetsAt)<=now)return '待更新'
  return isStale(w.updatedAt,c.staleMinutes,now)?'旧快照':''
}
function Meter({window:w,account:a,config:c,dense=false,big=false,detail=false}:{window:Window;account:AccountView;config:Config;dense?:boolean;big?:boolean;detail?:boolean}) {
  const b=brand(a.provider),color={light:b.light,dark:b.dark}
  const note=snapshotNote(w,c)
  return <VStack alignment="leading" spacing={dense?1:3} frame={{maxWidth:'infinity'}}>
    <HStack spacing={3}>
      <Text font={big?14:dense?10:11} fontWeight="semibold" foregroundStyle={muted}>{w.label}{dense&&note?` · ${note}`:''}</Text><Spacer/>
      <Text font={big?19:dense?11:13} fontWeight="semibold" monospacedDigit foregroundStyle={w.percent===null?muted:color}>{w.percent===null?'未知':`${Math.round(w.percent)}%`}</Text>
    </HStack>
    {w.percent!==null?<ProgressView value={(barPercent(w.percent)??0)/100} total={1} progressViewStyle="linear" tint={color}/>:<Text font={dense?8:10} foregroundStyle={muted}>额度未提供</Text>}
    {w.label==='7d'?<Text font={big?13:dense?9:10} foregroundStyle={muted} monospacedDigit lineLimit={1} minScaleFactor={0.75}>{windowDollars(w,c,now)}</Text>:null}
    {detail?<Text font={big?11:9} foregroundStyle={muted} lineLimit={1}>{note?`${note} · `:''}{relativeReset(w.resetsAt,now)}</Text>:note&&!dense?<Text font={8} foregroundStyle={muted} lineLimit={1}>{note}</Text>:null}
  </VStack>
}
function AccountCard({account:a,config:c,mode}:{account:AccountView;config:Config;mode:Layout}) {
  const b=brand(a.provider),color={light:b.light,dark:b.dark}
  const windows=visibleWindows(a,c)
  const dense=mode==='largeRows',big=mode==='largeOne'
  const roomy=big||mode==='largeTwo'||mode==='mediumOne'
  const header=<HStack spacing={dense?5:7}>
    <ProviderIcon provider={a.provider} size={big?30:dense?17:22}/>
    <Text font={big?21:dense?12:14} fontWeight="semibold" foregroundStyle={foreground} lineLimit={1} minScaleFactor={0.75}>{displayName(a,c.displayNames)}</Text><Spacer/>
    {roomy&&a.provider==='openai'&&a.resetCredits?<Link url={Script.createRunSingleURLScheme(Script.name,{action:'reset',accountID:String(a.id)})}><Text font={10} foregroundStyle={color}>重置…</Text></Link>:null}
  </HStack>
  const meters=windows.length?(dense||mode==='largeTwo'?<HStack alignment="top" spacing={12}>{windows.map((w,i)=><Meter key={String(i)} window={w} account={a} config={c} dense={dense} detail={mode==='largeTwo'}/>)}</HStack>:<VStack spacing={big?20:7}>{windows.map((w,i)=><Meter key={String(i)} window={w} account={a} config={c} big={big} detail={roomy}/>)}</VStack>):<Text font={big?13:10} foregroundStyle={muted} lineLimit={2}>{a.error?'暂时无法读取额度':'暂无额度快照'}</Text>
  const status=a.error?'连接异常':a.status!=='active'&&a.status!=='未知'?'账号异常':''
  const credits=a.resetCredits
  const creditLine=credits&&credits.available!==null?<Text font={big?11:9} foregroundStyle={muted} lineLimit={1}>重置券 {credits.available} 次 · 缓存</Text>:null
  return <VStack alignment="leading" spacing={big?18:dense?4:8} padding={dense?6:8} background={{style:cardBackground(a.provider),shape:{type:'rect',cornerRadius:12}}} frame={{maxWidth:'infinity'}}>
    {mode==='mediumOne'?<HStack alignment="top" spacing={18}><VStack alignment="leading" spacing={10} frame={{maxWidth:'infinity'}}>{header}{creditLine}{status?<Text font={9} foregroundStyle={warning}>{status}</Text>:null}</VStack><VStack frame={{maxWidth:'infinity'}}>{meters}</VStack></HStack>:<VStack alignment="leading" spacing={big?22:dense?4:8}>{header}{meters}{roomy?creditLine:null}{status&&!dense?<Text font={9} foregroundStyle={warning}>{status}</Text>:null}</VStack>}
  </VStack>
}
async function run(){
  let config=readConfig(),notice='',accounts:AccountView[]=[],savedAt=''
  const rootConfig=config
  // Parameter IDs determine both selection and adaptive density, never credentials.
  try{config={...config,accountIDs:selectWidgetIDs(config,Widget.parameter,Widget.family)}}catch(e){notice=e instanceof Error?e.message:'参数无效'}
  if(config.demo&&!notice){const demo=makeDemo(now);accounts=config.accountIDs.map(id=>demo.find(a=>a.id===id)).filter((a):a is AccountView=>!!a);savedAt=new Date(now).toISOString();notice='演示 · 虚构数据'}
  else if(!notice){
    const allConfig=rootConfig
    const cache=readCache(allConfig)
    accounts=config.accountIDs.map(id=>cache?.accounts.find(x=>x.id===id)).filter((x):x is AccountView=>!!x)
    savedAt=cache?.fetchedAt||''
    if(!cache || isStale(cache.fetchedAt,config.refreshMinutes,now) || accounts.length!==config.accountIDs.length || accounts.some(a=>isStale(a.fetchedAt,config.refreshMinutes,now))){
      try{
        const saved=Keychain.get(AUTH_KEY);if(!saved)throw new Error('请打开脚本配置管理凭证')
        const auth=JSON.parse(saved) as Auth & {baseURL:string;revision?:string}
        if(auth.baseURL!==config.baseURL || auth.revision!==config.revision || !auth.token || !['apiKey','jwt'].includes(auth.kind))throw new Error('请重新保存管理凭证')
        const result=await loadAccounts(config,auth,fetch,accounts);accounts=result.accounts;savedAt=result.fetchedAt
        if(Object.keys(result.errors).length)notice='连接异常 · 显示缓存'
        const merged=[...(cache?.accounts||[]).filter(a=>!config.accountIDs.includes(a.id)),...accounts]
        if(!saveCache(allConfig,merged,savedAt))notice=notice||'缓存保存失败'
      }catch(e){notice=e instanceof Error && /^请/.test(e.message)?e.message:'无法读取凭证或服务器'}
    }
    if(accounts.some(a=>a.error))notice=notice||'部分数据未更新'
  }
  const layout=widgetLayout(Widget.family,accounts.length)
  const view=<VStack alignment="leading" spacing={large?6:4} padding={10} widgetBackground={small&&accounts[0]?cardBackground(accounts[0].provider):bg}>
    {accounts.length===0?<VStack alignment="leading" spacing={8}><Text font={15} fontWeight="semibold" foregroundStyle={foreground}>连接你的用量</Text><Text font={11} foregroundStyle={muted}>{notice||'打开脚本，配置服务器与账号。'}</Text></VStack>:
      layout==='mediumOne'?<AccountCard account={accounts[0]} config={config} mode="mediumOne"/>:
      large?<VStack spacing={layout==='largeOne'?12:6}>{accounts.map(a=><AccountCard key={String(a.id)} account={a} config={config} mode={layout}/>)}</VStack>:
      small?<AccountCard account={accounts[0]} config={config} mode="small"/>:
      <HStack alignment="top" spacing={10}>{accounts.map(a=><AccountCard key={String(a.id)} account={a} config={config} mode="mediumTwo"/>)}</HStack>}
    {notice&&accounts.length?<Text font={8} foregroundStyle={muted} lineLimit={1}>{notice}</Text>:null}
  </VStack>
  Widget.present(view,{policy:'after',date:new Date(now+config.refreshMinutes*60_000)})
}
run()
