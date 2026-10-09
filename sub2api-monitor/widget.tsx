import { Widget, VStack, HStack, Text, Spacer, ProgressView, Image, Link, Script, fetch } from 'scripting'
import { brand, barPercent, compact, money, isStale, relativeReset, referenceRemaining, makeDemo, selectWidgetIDs, widgetLayout, type AccountView, type Window, type Config } from './model'
import { loadAccounts, type Auth } from './client'
import { readConfig, readCache, saveCache, AUTH_KEY } from './state'
const foreground = {light:'#243B3A',dark:'#EDF2F0'}
const muted = {light:'#758580',dark:'#97A8A2'}
const warning = {light:'#A07847',dark:'#D2AE79'}
const bg = {light:'#F5F7F4',dark:'#17201F'}
function cardBackground(provider:string){return provider==='anthropic'?{light:'#F3EAE2',dark:'#2D2420'}:provider==='antigravity'?{light:'#EBEDF6',dark:'#222639'}:{light:'#EAF1EC',dark:'#1D2B27'}}
function providerSymbol(provider:string){return provider==='anthropic'?'sun.max.fill':provider==='antigravity'?'cloud.fill':'circle.hexagongrid.fill'}
const small = Widget.family === 'systemSmall'
const large = Widget.family === 'systemLarge'
const now = Date.now()
function clockTime(at:string):string {const date = new Date(at);return Number.isFinite(date.getTime())?`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`:'未更新'}
function resetTime(at:string|null):string {if(!at)return '重置未知';const date=new Date(at);return `${date.getMonth()+1}/${date.getDate()} ${clockTime(at)}`}
function snapshotState(w:Window,c:Config):string {
  if(w.resetsAt && Date.parse(w.resetsAt)<=now)return `待采样 · ${resetTime(w.resetsAt)}`
  return `${isStale(w.updatedAt,c.staleMinutes,now)?'旧 · ':''}↻ ${resetTime(w.resetsAt)}`
}
function Meter({window:w,account:a,config:c,compact:tiny=false}:{window:Window;account:AccountView;config:Config;compact?:boolean}) {
  const b = brand(a.provider); const color = {light:b.light,dark:b.dark}
  const stale = isStale(w.updatedAt,c.staleMinutes,now) || (!!w.resetsAt && Date.parse(w.resetsAt)<=now)
  const cap = w.label==='5h' ? c.referenceCaps?.[String(a.id)]?.fiveHour : w.label==='7d' ? c.referenceCaps?.[String(a.id)]?.sevenDay : undefined
  const reference = referenceRemaining(w,cap)
  return <VStack alignment="leading" spacing={1} frame={{maxWidth:'infinity'}}>
    <HStack spacing={3}>
      <Text font={tiny?10:11} fontWeight="semibold" foregroundStyle={muted}>{w.label}</Text><Spacer/>
      <Text font={tiny?10:11} fontWeight="semibold" monospacedDigit foregroundStyle={stale?warning:foreground}>{w.percent===null?'未提供':`${Math.round(w.percent)}% 已用`}</Text>
    </HStack>
    <ProgressView value={(barPercent(w.percent)??0)/100} total={1} progressViewStyle="linear" tint={w.percent===null?muted:color}/>
    <Text font={tiny?8:9} lineLimit={1} minScaleFactor={0.75} foregroundStyle={stale?warning:muted}>{w.percent===null?'额度未知':reference || `估算余 ${Math.max(0,100-w.percent).toFixed(0)}%`} · {snapshotState(w,c)}</Text>
  </VStack>
}
function AccountCard({account:a,config:c,row=false}:{account:AccountView;config:Config;row?:boolean}) {
  const b=brand(a.provider);const color={light:b.light,dark:b.dark}
  const stale=!!a.error||isStale(a.fetchedAt,c.staleMinutes,now)
  const name = a.name
  return <VStack alignment="leading" spacing={3} padding={row?4:2} background={{style:cardBackground(a.provider),shape:{type:'rect',cornerRadius:10}}} frame={{maxWidth:'infinity'}}>
    <HStack spacing={4}>
      <Image systemName={providerSymbol(a.provider)} font={row?10:11} foregroundStyle={color}/>
      <Text font={row?10:11} fontWeight="bold" foregroundStyle={color}>{b.name}</Text>
      <Text font={row?11:12} fontWeight="semibold" lineLimit={1} minScaleFactor={0.75} foregroundStyle={foreground}>{name}</Text><Spacer/>
      {stale||a.status!=='active'?<Text font={8} foregroundStyle={warning}>{a.status!=='active'&&a.status!=='未知'?'异常':'缓存'}</Text>:null}
    </HStack>
    <HStack spacing={3}>
      <Text font={row?8:9} foregroundStyle={muted} lineLimit={1}>{a.groups.join(' / ')||'未分组'} · #{a.id} · {a.windows[0]?.updatedAt?`采样 ${clockTime(a.windows[0].updatedAt)}`:'无采样时间'}</Text><Spacer/>
      {row?<Text font={8} monospacedDigit foregroundStyle={muted}>今日 {money(a.todayCost)} · {compact(a.todayTokens)} tok</Text>:null}
    </HStack>
    {a.windows.length>0 ? row ? <HStack spacing={12}>{a.windows.map((w,i)=><Meter key={String(i)} window={w} account={a} config={c} compact/>)}</HStack> : <VStack spacing={3}>{a.windows.map((w,i)=><Meter key={String(i)} window={w} account={a} config={c}/>)}</VStack> : <Text font={10} foregroundStyle={muted} lineLimit={2}>{a.error||'原生额度：被动接口未提供'}</Text>}
    {!row?<HStack><Text font={9} foregroundStyle={muted}>今日计费</Text><Spacer/><Text font={10} fontWeight="semibold" monospacedDigit foregroundStyle={foreground}>{money(a.todayCost)} · {compact(a.todayTokens)} tok</Text></HStack>:null}
  </VStack>
}
function DetailMeter({window:w,account:a,config:c,big=false}:{window:Window;account:AccountView;config:Config;big?:boolean}) {
  const b=brand(a.provider),color={light:b.light,dark:b.dark}
  const cap=w.label==='5h'?c.referenceCaps?.[String(a.id)]?.fiveHour:w.label==='7d'?c.referenceCaps?.[String(a.id)]?.sevenDay:undefined
  const remaining=referenceRemaining(w,cap)
  return <VStack alignment="leading" spacing={2} frame={{maxWidth:'infinity'}}>
    <HStack><Text font={big?13:11} fontWeight="semibold" foregroundStyle={foreground}>{w.label} 已用</Text><Spacer/><Text font={big?16:14} fontWeight="bold" monospacedDigit foregroundStyle={color}>{w.percent===null?'—':`${Math.round(w.percent)}%`}</Text></HStack>
    <ProgressView value={(barPercent(w.percent)??0)/100} total={1} progressViewStyle="linear" tint={color}/>
    <Text font={big?10:9} foregroundStyle={muted} lineLimit={1}>{w.percent===null?'未提供原生额度':remaining?`${remaining} / ${money(cap??null)} 手动参考`:`估算剩余 ${Math.max(0,100-w.percent).toFixed(0)}% · 原生限额 100%`}</Text>
    <Text font={big?10:9} foregroundStyle={isStale(w.updatedAt,c.staleMinutes,now)?warning:muted} lineLimit={1}>{snapshotState(w,c)} · {relativeReset(w.resetsAt,now)}</Text>
  </VStack>
}
function ExpandedCard({account:a,config:c,mode}:{account:AccountView;config:Config;mode:'mediumOne'|'largeOne'|'largeTwo'}) {
  const b=brand(a.provider),color={light:b.light,dark:b.dark},big=mode==='largeOne'
  const resetLink=a.provider==='openai'?<Link url={Script.createRunSingleURLScheme(Script.name,{action:'reset',accountID:String(a.id)})}><Text font={9} foregroundStyle={color}>重置…</Text></Link>:null
  const header=<VStack alignment="leading" spacing={4} frame={{maxWidth:'infinity'}}>
    <HStack spacing={5}><Image systemName={providerSymbol(a.provider)} font={big?16:14} foregroundStyle={color}/><Text font={big?14:13} fontWeight="bold" foregroundStyle={color}>{b.name}</Text><Spacer/><Text font={9} foregroundStyle={a.error?warning:muted}>{a.error?'缓存 / 异常':a.status==='active'?'正常':a.status}</Text>{resetLink}</HStack>
    <Text font={big?16:14} fontWeight="semibold" foregroundStyle={foreground} lineLimit={1} minScaleFactor={0.75}>{a.name}</Text>
    <Text font={big?10:9} foregroundStyle={muted} lineLimit={1}>{a.groups.join(' / ')||'未分组'} · #{a.id}</Text>
  </VStack>
  const stats=<VStack alignment="leading" spacing={3}>
    <Text font={big?14:12} fontWeight="semibold" monospacedDigit foregroundStyle={foreground}>{money(a.todayCost)} 今日计费</Text>
    <Text font={10} foregroundStyle={muted} monospacedDigit>{compact(a.todayTokens)} tok · {compact(a.todayRequests??null)} 次</Text>
    <Text font={big?9:8} foregroundStyle={muted} lineLimit={1}>采样 {a.windows[0]?.updatedAt?resetTime(a.windows[0].updatedAt):'时间未知'}</Text>
  </VStack>
  const credits=a.resetCredits
  const creditLine=credits && (credits.available!==null||credits.state||credits.automatic!==null)?<Text font={big?10:9} foregroundStyle={muted} lineLimit={1}>重置券缓存：{credits.available===null?'未知':`${credits.available} 次`}{credits.expiresAt?` · 到期 ${resetTime(credits.expiresAt)}`:''}{credits.state?` · ${credits.state}`:''}</Text>:null
  const meters=a.windows.length?<VStack spacing={big?6:7}>{a.windows.map((w,i)=><DetailMeter key={String(i)} window={w} account={a} config={c} big={big}/>)}</VStack>:<VStack spacing={8}><Text font={big?13:11} foregroundStyle={muted}>原生额度：被动接口未提供</Text><Text font={big?10:9} foregroundStyle={muted}>仅展示本实例用量，不触发上游探测。</Text></VStack>
  return <VStack alignment="leading" spacing={big?4:6} padding={6} background={{style:cardBackground(a.provider),shape:{type:'rect',cornerRadius:12}}} frame={{maxWidth:'infinity'}}>
    {mode==='mediumOne'?<HStack alignment="top" spacing={14}><VStack alignment="leading" spacing={7} frame={{maxWidth:'infinity'}}>{header}{stats}</VStack><VStack frame={{maxWidth:'infinity'}}>{meters}</VStack></HStack>:mode==='largeTwo'?<VStack alignment="leading" spacing={5}>
      <HStack spacing={8}><Image systemName={providerSymbol(a.provider)} font={14} foregroundStyle={color}/><Text font={13} fontWeight="semibold" foregroundStyle={foreground} lineLimit={1}>{a.name}</Text><Spacer/><Text font={10} foregroundStyle={color}>{b.name}</Text>{resetLink}</HStack>
      <Text font={9} foregroundStyle={muted} lineLimit={1}>{a.groups.join(' / ')||'未分组'} · #{a.id} · {a.error?'缓存 / 异常':a.status==='active'?'正常':a.status}</Text>
      {a.windows.length?<HStack alignment="top" spacing={12}>{a.windows.map((w,i)=><DetailMeter key={String(i)} window={w} account={a} config={c}/>)}</HStack>:meters}
      <Text font={9} foregroundStyle={muted} monospacedDigit lineLimit={1}>今日 {money(a.todayCost)} · {compact(a.todayTokens)} tok · {compact(a.todayRequests??null)} 次 · 采样 {clockTime(a.windows[0]?.updatedAt||'')}</Text>
    </VStack>:<VStack alignment="leading" spacing={4}>{header}{stats}{meters}</VStack>}
    {mode!=='mediumOne'?creditLine:null}
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
  const view=<VStack alignment="leading" spacing={large?5:4} padding={8} widgetBackground={small&&accounts[0]?cardBackground(accounts[0].provider):bg}>
    <HStack spacing={4}><Text font={small?10:12} fontWeight="bold" foregroundStyle={foreground}>SUB2API</Text><Spacer/><Text font={8} foregroundStyle={notice?warning:muted} lineLimit={1}>{notice||`${clockTime(savedAt)} 更新`}</Text></HStack>
    {accounts.length===0?<VStack alignment="leading" spacing={8}><Text font={15} fontWeight="semibold" foregroundStyle={foreground}>连接你的用量</Text><Text font={11} foregroundStyle={muted}>{notice||'打开脚本，安全配置服务器与账号。'}</Text></VStack>:layout==='mediumOne'?<ExpandedCard account={accounts[0]} config={config} mode="mediumOne"/>:layout==='largeOne'||layout==='largeTwo'?<VStack spacing={8}>{accounts.map(a=><ExpandedCard key={String(a.id)} account={a} config={config} mode={layout}/>)}</VStack>:large?<VStack spacing={4}>{accounts.map(a=><AccountCard key={String(a.id)} account={a} config={config} row/>)}</VStack>:small?<AccountCard account={accounts[0]} config={config}/>:<HStack alignment="top" spacing={14}>{accounts.map(a=><AccountCard key={String(a.id)} account={a} config={config}/>)}</HStack>}
    {large?<Text font={8} foregroundStyle={muted} lineLimit={1}>快照 ≠ 实时 · 今日为本地计费 · 参考额度仅为手动估算</Text>:null}
  </VStack>
  Widget.present(view,{policy:'after',date:new Date(now+config.refreshMinutes*60_000)})
}
run()
