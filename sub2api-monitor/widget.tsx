import { Widget, VStack, HStack, Text, Spacer, ProgressView, Link, Script, fetch } from 'scripting'
import { barPercent, isStale, makeDemo, selectWidgetIDs, widgetLayout, type AccountView, type Window, type Config, type Layout } from './model'
import {displayName,windowDollars,visibleWindows,resetTime,updateFooter} from './display'
import {ProviderIcon,preloadProviderIcons,type ProviderImages} from './provider-icons'
import { loadAccounts, type Auth } from './client'
import { readConfig, readCache, saveCache, AUTH_KEY } from './state'
// Neutral adaptive styling. Only the genuine logo artwork retains brand colors.
const foreground = {light:'#1C1C1E',dark:'#F2F2F7'}
const muted = {light:'#636366',dark:'#AEAEB2'}
const warning = foreground
const bg = {light:'#FFFFFF',dark:'#000000'}
const meterColor = {light:'#48484A',dark:'#D1D1D6'}
const small = Widget.family === 'systemSmall'
const large = Widget.family === 'systemLarge'
const now = Date.now()
/** Stale snapshots are neutral metadata; 0% is never a warning by itself. */
function snapshotNote(w:Window,c:Config):string {
  if(w.resetsAt&&Date.parse(w.resetsAt)<=now)return '待更新'
  return isStale(w.updatedAt,c.staleMinutes,now)?'旧快照':''
}
function Meter({window:w,config:c,dense=false,compact=false,big=false,solo=false}:{window:Window;config:Config;dense?:boolean;compact?:boolean;big?:boolean;solo?:boolean}) {
  const note=snapshotNote(w,c)
  return <VStack alignment="leading" spacing={big&&solo?8:dense||compact?1:3} frame={{maxWidth:'infinity'}}>
    <HStack spacing={3}>
      <Text font={big&&solo?17:big?14:dense||compact?10:11} fontWeight="semibold" foregroundStyle={muted}>{w.label}{note?` · ${note}`:''}</Text><Spacer/>
      <Text font={big&&solo?44:big?19:solo&&!dense&&!compact?25:dense?11:compact?12:13} fontWeight="semibold" monospacedDigit foregroundStyle={w.percent===null?muted:meterColor}>{w.percent===null?'未知':`${Math.round(w.percent)}%`}</Text>
    </HStack>
    {w.percent!==null?<ProgressView value={(barPercent(w.percent)??0)/100} total={1} progressViewStyle="linear" tint={meterColor}/>:<Text font={dense?8:10} foregroundStyle={muted}>额度未提供</Text>}
    {w.label==='7d'?<Text font={big&&solo?17:big?13:dense||compact?9:10} foregroundStyle={muted} monospacedDigit lineLimit={1} minScaleFactor={0.75}>{windowDollars(w,c,now)}</Text>:null}
    <Text font={big&&solo?14:big?12:dense||compact?8:9} foregroundStyle={muted} monospacedDigit lineLimit={1} minScaleFactor={0.75}>{resetTime(w.resetsAt)}</Text>
  </VStack>
}
function AccountCard({account:a,config:c,mode,images}:{account:AccountView;config:Config;mode:Layout;images:ProviderImages}) {
  const windows=visibleWindows(a,c)
  const solo=windows.length===1
  const dense=mode==='largeRows',big=mode==='largeOne',compact=mode==='small'||mode==='mediumTwo'
  const roomy=big||mode==='largeTwo'||mode==='mediumOne'
  const header=<HStack spacing={dense?5:7}>
    <ProviderIcon images={images} provider={a.provider} size={big?30:dense?17:compact?20:22}/>
    <Text font={big?21:dense?12:compact?13:14} fontWeight="semibold" foregroundStyle={foreground} lineLimit={1} minScaleFactor={0.75}>{displayName(a,c.displayNames)}</Text><Spacer/>
    {roomy&&a.provider==='openai'&&a.resetCredits?<Link url={Script.createRunSingleURLScheme(Script.name,{action:'reset',accountID:String(a.id)})}><Text font={10} foregroundStyle={foreground}>重置…</Text></Link>:null}
  </HStack>
  const meters=windows.length?(dense||mode==='largeTwo'?<HStack alignment="top" spacing={12}>{windows.map((w,i)=><Meter key={String(i)} window={w} config={c} dense={dense} solo={solo}/>)}</HStack>:<VStack spacing={big?20:compact?4:7}>{windows.map((w,i)=><Meter key={String(i)} window={w} config={c} compact={compact} big={big} solo={solo}/>)}</VStack>):<Text font={big?13:10} foregroundStyle={muted} lineLimit={2}>{a.error?'暂时无法读取额度':'暂无额度快照'}</Text>
  const status=a.error?'连接异常':a.status!=='active'&&a.status!=='未知'?'账号异常':''
  const credits=a.resetCredits
  const creditLine=credits&&credits.available!==null?<Text font={big?11:9} foregroundStyle={muted} lineLimit={1}>重置券 {credits.available} 次 · 缓存</Text>:null
  return <VStack alignment="leading" spacing={big?12:dense||compact?3:6} padding={{vertical:compact?0:dense?4:2}} frame={{maxWidth:'infinity'}}>
    {mode==='mediumOne'&&!solo?<HStack alignment="top" spacing={18}><VStack alignment="leading" spacing={10} frame={{maxWidth:'infinity'}}>{header}{creditLine}{status?<Text font={9} foregroundStyle={warning}>{status}</Text>:null}</VStack><VStack frame={{maxWidth:'infinity'}}>{meters}</VStack></HStack>:<VStack alignment="leading" spacing={big&&solo?24:big?14:dense||compact?3:6}>{header}{meters}{roomy&&!(mode==='mediumOne'&&solo)?creditLine:null}{status&&!dense&&!(compact&&a.error)?<Text font={9} foregroundStyle={warning}>{status}</Text>:null}</VStack>}
  </VStack>
}
async function run(){
  const artwork=preloadProviderIcons()
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
  // Official widget samples use the actual host dimensions for full-surface backgrounds.
  // No outer padding or inner card fill: short content must not create a colored strip.
  const view=<VStack spacing={0} frame={Widget.displaySize} widgetBackground={bg}>
    <VStack alignment="leading" spacing={large?8:2} padding={small?{horizontal:14,vertical:8}:12} frame={{maxWidth:'infinity',maxHeight:'infinity'}}>
    {accounts.length===0?<VStack alignment="leading" spacing={8}><Text font={15} fontWeight="semibold" foregroundStyle={foreground}>连接你的用量</Text><Text font={11} foregroundStyle={muted}>{notice||'打开脚本，配置服务器与账号。'}</Text></VStack>:
      layout==='mediumOne'?<AccountCard images={artwork.images} account={accounts[0]} config={config} mode="mediumOne"/>:
      large?<VStack spacing={layout==='largeOne'?10:4}>{accounts.map(a=><AccountCard images={artwork.images} key={String(a.id)} account={a} config={config} mode={layout}/>)}</VStack>:
      small?<AccountCard images={artwork.images} account={accounts[0]} config={config} mode="small"/>:
      <HStack alignment="top" spacing={10}>{accounts.map(a=><AccountCard images={artwork.images} key={String(a.id)} account={a} config={config} mode="mediumTwo"/>)}</HStack>}
    <Spacer/>
    {notice&&accounts.length?<Text font={8} foregroundStyle={muted} lineLimit={1}>{notice}</Text>:null}
    {accounts.length?<Text font={8} foregroundStyle={muted} monospacedDigit lineLimit={1} minScaleFactor={0.75}>{updateFooter(accounts)}</Text>:null}
    </VStack>
  </VStack>
  Widget.present(view,{policy:'after',date:new Date(now+config.refreshMinutes*60_000)})
}
run()
