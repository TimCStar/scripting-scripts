import { Widget, VStack, HStack, Text, Spacer, ProgressView, Button, Image, Link, Script, fetch } from 'scripting'
import { barPercent, isStale, makeDemo, selectWidgetIDs, widgetLayout, type AccountView, type Window, type Config, type Layout } from './model'
import {displayName,windowDollars,visibleWindows,countdown,updateFooter,todayUsage} from './display'
import {ProviderIcon,preloadProviderIcons,type ProviderImages} from './provider-icons'
import { refreshMonitor } from './refresh'
import { readConfig, readCache, identity } from './state'
import { RefreshMonitorIntent } from './app_intents'
// Neutral adaptive styling. Only the genuine logo artwork retains brand colors.
const foreground = {light:'#1C1C1E',dark:'#F2F2F7'}
const muted = {light:'#636366',dark:'#AEAEB2'}
const warning = foreground
const bg = {light:'#FFFFFF',dark:'#000000'}
const meterColor = {light:'#48484A',dark:'#D1D1D6'}
const small = Widget.family === 'systemSmall'
const large = Widget.family === 'systemLarge'
let now = Date.now()
/** Stale snapshots are neutral metadata; 0% is never a warning by itself. */
function snapshotNote(w:Window,c:Config):string {
  if(w.resetsAt&&Date.parse(w.resetsAt)<=now)return '待更新'
  return isStale(w.updatedAt,c.staleMinutes,now)?'旧快照':''
}
type MeterType = {label:number;value:number;detail:number;clock:number;gap:number}
// Two compositions, not a hidden row in the same two-window card. The single
// window gets the entire available width and a substantially larger type scale.
function WindowReading({window:w,config:c,type:t}:{window:Window;config:Config;type:MeterType}) {
  const note=snapshotNote(w,c)
  return <VStack alignment="leading" spacing={t.gap} frame={{maxWidth:'infinity'}}>
    <HStack alignment="firstTextBaseline" spacing={3}>
      <Text font={t.label} fontWeight="bold" foregroundStyle={foreground} lineLimit={1} minScaleFactor={0.8}>{w.label}</Text>
      {note?<Text font={8} foregroundStyle={muted} lineLimit={1} minScaleFactor={0.75}>{note}</Text>:null}
      <Spacer/>
      <Text font={t.value} fontWeight="semibold" monospacedDigit foregroundStyle={w.percent===null?muted:foreground} lineLimit={1} minScaleFactor={0.8}>{w.percent===null?'未知':`${Math.round(w.percent)}%`}</Text>
    </HStack>
    {w.percent!==null?<ProgressView value={(barPercent(w.percent)??0)/100} total={1} progressViewStyle="linear" tint={meterColor}/>:null}
    <HStack spacing={4}>
      {w.label==='7d'?<Text font={t.detail} foregroundStyle={muted} monospacedDigit lineLimit={1} minScaleFactor={0.75}>{windowDollars(w,c,now)}</Text>:null}
      <Spacer/>
      <HStack spacing={2}><Image systemName="clock" font={t.clock} foregroundStyle={muted}/><Text font={t.detail} foregroundStyle={muted} monospacedDigit lineLimit={1} minScaleFactor={0.75}>{countdown(w.resetsAt,now)}</Text></HStack>
    </HStack>
  </VStack>
}
function SingleWindow({window,config,mode}:{window:Window;config:Config;mode:Layout}) {
  const type:MeterType=mode==='largeOne'?{label:32,value:64,detail:18,clock:16,gap:10}
    :mode==='largeRows'?{label:17,value:20,detail:9,clock:9,gap:0}
    :mode==='small'||mode==='mediumTwo'?{label:22,value:32,detail:10,clock:9,gap:3}
    :mode==='mediumOne'?{label:24,value:36,detail:12,clock:11,gap:3}
    :{label:26,value:40,detail:12,clock:11,gap:5}
  return <VStack alignment="leading" spacing={0} frame={{maxWidth:'infinity'}}><WindowReading window={window} config={config} type={type}/></VStack>
}
function DualWindows({windows,config,mode}:{windows:Window[];config:Config;mode:Layout}) {
  const compact=mode==='small'||mode==='mediumTwo'
  const dense=mode==='largeRows'
  const type:MeterType=mode==='largeOne'?{label:23,value:32,detail:14,clock:12,gap:5}
    :compact?{label:13,value:13,detail:7,clock:7,gap:1}
    :dense?{label:14,value:17,detail:8,clock:8,gap:1}
    :{label:18,value:24,detail:10,clock:9,gap:3}
  const readings=windows.map((w,i)=><WindowReading key={String(i)} window={w} config={config} type={type}/>)
  // Narrow cards stack windows; wide cards pair them. Neither branch leaves an
  // empty second column or a 5h-sized placeholder after 5h is hidden.
  return compact||mode==='largeOne'?<VStack spacing={compact?3:18} frame={{maxWidth:'infinity'}}>{readings}</VStack>
    :<HStack alignment="top" spacing={14} frame={{maxWidth:'infinity'}}>{readings}</HStack>
}
function AccountCard({account:a,config:c,mode,images}:{account:AccountView;config:Config;mode:Layout;images:ProviderImages}) {
  const windows=visibleWindows(a,c),solo=windows.length===1
  const dense=mode==='largeRows',big=mode==='largeOne',compact=mode==='small'||mode==='mediumTwo'
  const roomy=big||mode==='largeTwo'||mode==='mediumOne'
  const status=a.error?'连接异常':a.status!=='active'&&a.status!=='未知'?'账号异常':''
  const header=<HStack spacing={dense?5:7} padding={{trailing:24}}>
    <ProviderIcon images={images} provider={a.provider} size={big?40:dense?20:compact?24:28}/>
    <Text font={big?21:dense?12:compact?13:14} fontWeight="semibold" foregroundStyle={foreground} lineLimit={1} minScaleFactor={0.75}>{displayName(a,c.displayNames)}</Text>
    {status?<Text font={8} foregroundStyle={warning} lineLimit={1}>{compact||dense?'异常':status}</Text>:null}<Spacer/>
    {roomy&&a.provider==='openai'&&a.resetCredits?<Link url={Script.createRunSingleURLScheme(Script.name,{action:'reset',accountID:String(a.id)})}><Text font={10} foregroundStyle={foreground}>重置…</Text></Link>:null}
  </HStack>
  const meters=solo?<SingleWindow window={windows[0]} config={c} mode={mode}/>:windows.length?<DualWindows windows={windows} config={c} mode={mode}/>:<Text font={big?13:10} foregroundStyle={muted} lineLimit={2}>{a.error?'暂时无法读取额度':'暂无额度快照'}</Text>
  const credits=a.resetCredits
  const creditLine=roomy&&!(mode==='mediumOne'&&solo)&&credits&&credits.available!==null?<Text font={big?11:9} foregroundStyle={muted} lineLimit={1}>重置券 {credits.available} 次 · 缓存</Text>:null
  const data=<VStack alignment="leading" spacing={big?12:3} frame={{maxWidth:'infinity'}}>{meters}{creditLine}</VStack>
  // Only this region expands. Its intrinsic DATA remains vertically centered;
  // the identity row and the daily/update footer cannot drift to the edges.
  return <VStack alignment="leading" spacing={big?10:2} frame={{maxWidth:'infinity',maxHeight:'infinity'}}>
    {header}
    <VStack frame={{maxWidth:'infinity',maxHeight:'infinity',alignment:'center'}}>{data}</VStack>
  </VStack>
}
async function run(){
  const artwork=preloadProviderIcons()
  let config=readConfig(),notice='',accounts:AccountView[]=[]
  const rootConfig=config
  // Parameter IDs determine both selection and adaptive density, never credentials.
  try{config={...config,accountIDs:selectWidgetIDs(config,Widget.parameter,Widget.family)}}catch(e){notice=e instanceof Error?e.message:'参数无效'}
  if(config.demo&&!notice){const demo=makeDemo(now);accounts=config.accountIDs.map(id=>demo.find(a=>a.id===id)).filter((a):a is AccountView=>!!a);notice='演示 · 虚构数据'}
  else if(!notice){
    const cache=readCache(rootConfig)
    accounts=config.accountIDs.map(id=>cache?.accounts.find(x=>x.id===id)).filter((a):a is AccountView=>!!a)
    // Always reread the server when a timeline actually executes. The App Intent
    // and widget run in independent hosts; Storage persistence may still lag.
    const outcome=await refreshMonitor({accountIDs:config.accountIDs,identity:identity(rootConfig)},fetch)
    if(outcome.status==='discarded'||outcome.status==='ignored')accounts=[]
    else if(outcome.accounts)accounts=outcome.accounts
    notice=outcome.notice
    if(accounts.some(a=>a.error))notice=notice||'部分数据未更新'
  }
  now=Date.now()
  const layout=widgetLayout(Widget.family,accounts.length)
  // Official widget samples use the actual host dimensions for full-surface backgrounds.
  // The background has no inset; content has a modest, consistent safe inset.
  const view=<VStack spacing={0} frame={Widget.displaySize} widgetBackground={bg}>
    <VStack padding={{horizontal:small?14:12,vertical:large?12:10}} frame={{maxWidth:'infinity',maxHeight:'infinity'}}>
    <VStack overlay={accounts.length?{alignment:'topTrailing',content:<Button buttonStyle="plain" intent={RefreshMonitorIntent({accountIDs:config.accountIDs,identity:identity(rootConfig)})}><Image systemName="arrow.clockwise" font={14} foregroundStyle={foreground} frame={{width:24,height:24}}/></Button>}:undefined} alignment="leading" spacing={2} frame={{maxWidth:'infinity',maxHeight:'infinity'}}>
    {accounts.length===0?<VStack alignment="leading" spacing={8}><Text font={15} fontWeight="semibold" foregroundStyle={foreground}>连接你的用量</Text><Text font={11} foregroundStyle={muted}>{notice||'打开脚本，配置服务器与账号。'}</Text></VStack>:
      layout==='mediumOne'?<AccountCard images={artwork.images} account={accounts[0]} config={config} mode="mediumOne"/>:
      large?<VStack spacing={layout==='largeRows'?2:8} frame={{maxWidth:'infinity',maxHeight:'infinity'}}>{accounts.map(a=><AccountCard images={artwork.images} key={String(a.id)} account={a} config={config} mode={layout}/>)}</VStack>:
      small?<AccountCard images={artwork.images} account={accounts[0]} config={config} mode="small"/>:
      <HStack alignment="top" spacing={10} frame={{maxWidth:'infinity',maxHeight:'infinity'}}>{accounts.map(a=><AccountCard images={artwork.images} key={String(a.id)} account={a} config={config} mode="mediumTwo"/>)}</HStack>}
    {accounts.length===0?<Spacer/>:null}
    {notice&&accounts.length?<Text font={8} foregroundStyle={muted} lineLimit={1} frame={{maxWidth:'infinity',alignment:'center'}} multilineTextAlignment="center">{notice}</Text>:null}
    {accounts.length?<VStack spacing={1} frame={{maxWidth:'infinity'}}>{accounts.map(a=><Text key={String(a.id)} font={8} foregroundStyle={muted} monospacedDigit lineLimit={1} minScaleFactor={0.65} frame={{maxWidth:'infinity',alignment:'center'}} multilineTextAlignment="center">{accounts.length>1?`${displayName(a,config.displayNames)} · ${todayUsage(a,config,now)}`:todayUsage(a,config,now)}</Text>)}</VStack>:null}
    {accounts.length?<Text font={8} foregroundStyle={muted} monospacedDigit lineLimit={1} minScaleFactor={0.75} frame={{maxWidth:'infinity',alignment:'center'}} multilineTextAlignment="center">{updateFooter(accounts)}</Text>:null}
    </VStack>
    </VStack>
  </VStack>
  Widget.present(view,{policy:'after',date:new Date(now+config.refreshMinutes*60_000)})
}
run()
