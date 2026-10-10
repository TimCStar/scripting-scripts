// Executes transpiled TSX with a minimal Scripting bridge double. This checks the
// generated view tree and lifecycle, NOT SwiftUI layout, pixels or iPhone APIs.
const ts=require('typescript'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict')
function render(family,count,decoder='embedded',invalid=false,fixture='default'){
  const events=[],modules={},result={}
  const jsx=(type,props,...children)=>typeof type==='function'?type({...props,children}):{type,props:props||{},children:children.flat(Infinity).filter(x=>x!==null&&x!==undefined&&x!==false)}
  const bridge={AppIntentProtocol:{AppIntent:'AppIntent'},AppIntentManager:{register:definition=>params=>({definition,params})},Script:{directory:'/missing-import-assets',name:'Sub2API',createRunSingleURLScheme:()=> 'scripting://review'},Widget:{family,displaySize:{width:family==='systemSmall'?155:329,height:family==='systemLarge'?345:155},parameter:invalid?'999':Array.from({length:count},(_,i)=>String(101+i)).join(','),present(view,policy){events.push('present');result.view=view;result.policy=policy}},fetch(){throw Error('No network allowed in demo')}}
  for(const name of ['VStack','HStack','Text','Spacer','ProgressView','Link','Image','Button'])bridge[name]=name
  const globals={jsx,console,Date,JSON,Path:{join:(...xs)=>xs.join('/')},Storage:{get:()=>({version:1,demo:true,fiveHourVisibility:fixture==='single7d'?{101:'hide',102:'hide',103:'hide',104:'hide'}:{}}),set:()=>{throw Error('Unexpected write')}},Keychain:{get:()=>{throw Error('Unexpected keychain')}},UIImage:{fromBase64String(data){events.push('decode');const png=Buffer.from(data,'base64');assert.equal(png.subarray(1,4).toString(),'PNG');return decoder==='embedded'?{decoded:true}:null},fromFile(){events.push('file');return decoder==='file'?{decoded:true}:null}}}
  function load(file){file=path.resolve(file);if(modules[file])return modules[file].exports;const module={exports:{}};modules[file]=module;const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText;const require=name=>name==='scripting'?bridge:load(path.resolve(path.dirname(file),name)+(fs.existsSync(path.resolve(path.dirname(file),name)+'.ts')?'.ts':'.tsx'));vm.runInNewContext(`(function(require,module,exports){${code}\n})`,globals,{filename:file})(require,module,module.exports);if(file.endsWith('/model.ts')&&(fixture==='bothStale'||fixture==='single7d'||fixture==='bothUnknown')){const original=module.exports.makeDemo;module.exports.makeDemo=now=>original(now).map(a=>({...a,status:fixture==='bothUnknown'?'paused':a.status,windows:[{label:'5h',percent:fixture==='bothUnknown'?null:37,resetsAt:fixture==='bothUnknown'?null:new Date(now+3600000).toISOString(),updatedAt:new Date(now-7200000).toISOString()},{label:'7d',percent:fixture==='bothUnknown'?null:21,resetsAt:new Date(now+86400000).toISOString(),updatedAt:new Date(now-7200000).toISOString(),costStatus:'complete',usedUSD:21,estimatedTotalUSD:100}]}))}if(file.endsWith('/state.ts')&&fixture==='single7d'){const read=module.exports.readConfig;module.exports.readConfig=()=>({...read(),fiveHourVisibility:{101:'hide',102:'hide',103:'hide',104:'hide'}})}return module.exports}
  load('widget.tsx');assert.ok(result.view,'Widget.present must run');assert.equal(events.at(-1),'present');assert.equal(events.filter(e=>e==='decode').length,6);assert.equal(result.view.type,'VStack');assert.deepEqual(JSON.parse(JSON.stringify(result.view.props.frame)),bridge.Widget.displaySize);assert.deepEqual(JSON.parse(JSON.stringify(result.view.props.widgetBackground)),{light:'#FFFFFF',dark:'#000000'});assert.equal(result.view.props.padding,undefined,'No inset on background root');assert.deepEqual(JSON.parse(JSON.stringify(result.view.children[0].props.padding)),{horizontal:family==='systemSmall'?14:12,vertical:family==='systemLarge'?12:10});assert.ok(result.policy.date instanceof Date)
  const nodes=[];function walk(node){if(typeof node!=='object'||!node)return;nodes.push(node);if(node.props?.overlay?.content)walk(node.props.overlay.content);for(const child of node.children||[])walk(child)}walk(result.view)
  const meters=nodes.filter(n=>n.type==='ProgressView');
  const clocks=nodes.filter(n=>n.type==='HStack'&&n.children.some(c=>c.type==='Image'&&c.props.systemName==='clock'));
  const timeRows=clocks.map(n=>n.children[1]);assert.equal(timeRows.length,invalid?0:fixture==='single7d'?count:fixture==='default'?([0,1,3,3,5][count]):count*2);
  for(const clock of clocks){assert.equal(clock.children[1].type,'Text');assert.match(clock.children[1].children.join(''),/^(?:—|<1m|\d+m|\d+h\d+m|\d+d\d+h)$/)}
  assert.ok(!nodes.some(n=>n.type==='Text'&&n.children.some(c=>typeof c==='string'&&c.includes('重置于'))),'Widget no longer contains absolute reset labels');
  if(fixture==='bothUnknown'){assert.equal(meters.length,0);assert.ok(!nodes.some(n=>n.type==='Text'&&n.children.includes('额度未提供')))}
  if(fixture==='bothStale'){assert.equal(meters.length,count*2);assert.ok(!nodes.some(n=>n.type==='Text'&&n.children.some(c=>typeof c==='string'&&c.includes('旧快照'))),'An aged successful sample must not display the fallback label')}
  const resetLinks=nodes.filter(n=>n.type==='Link');
  const roomy=family==='systemMedium'&&count===1||family==='systemLarge'&&count<=2;
  assert.equal(resetLinks.length,!invalid&&roomy?1:0,'Preserve existing roomy OpenAI reset review link');
  const creditRows=nodes.filter(n=>n.type==='Text'&&n.children.some(c=>typeof c==='string'&&c.startsWith('重置券 ')));
  const mediumSolo=family==='systemMedium'&&count===1&&(fixture==='single7d'||fixture==='default');
  assert.equal(creditRows.length,!invalid&&roomy&&!mediumSolo?1:0,'Preserve existing cached credit count where previously visible');
  const refresh=nodes.filter(n=>n.type==='Button');assert.equal(refresh.length,invalid?0:1);
  if(!invalid){assert.equal(refresh[0].props.action,undefined);assert.equal(refresh[0].props.intent.definition.name,'RefreshMonitorIntent');assert.equal(refresh[0].children[0].props.systemName,'arrow.clockwise');assert.equal(result.view.children[0].children[0].props.overlay.alignment,'topTrailing');assert.deepEqual(Array.from(refresh[0].props.intent.params.accountIDs),Array.from({length:count},(_,i)=>101+i))}
  const footer=nodes.filter(n=>n.type==='Text'&&n.children.some(c=>typeof c==='string'&&c.startsWith('更新于：')))
  assert.equal(footer.length,invalid?0:1,'Exactly one update footer for displayed data')
  const daily=nodes.filter(n=>n.type==='Text'&&n.children.some(c=>typeof c==='string'&&c.includes('今日用量：')));assert.equal(daily.length,invalid?0:count);for(const row of daily){assert.equal(row.props.frame.alignment,'center');assert.equal(row.props.multilineTextAlignment,'center');assert.equal(row.props.lineLimit,1);assert.equal(row.props.minScaleFactor,0.65)}
  for(const row of [...daily,...footer])assert.ok(row.props.font>=9,'Footer text is larger than the old 8pt baseline');
  const centeredText=footer;
  const leadingText=[...timeRows,...nodes.filter(n=>n.type==='Text'&&n.children.some(c=>typeof c==='string'&&/^(?:\$|— \/ )/.test(c)))];
  for(const row of leadingText){assert.equal(row.props.frame,undefined);assert.equal(row.props.multilineTextAlignment,undefined);assert.equal(row.props.lineLimit,1);assert.equal(row.props.minScaleFactor,0.75)}
  for(const row of centeredText){assert.equal(row.props.frame?.maxWidth,'infinity');assert.equal(row.props.frame?.alignment,'center');assert.equal(row.props.multilineTextAlignment,'center');assert.equal(row.props.lineLimit,1);assert.equal(row.props.minScaleFactor,0.75)}
  for(const meter of nodes.filter(n=>n.type==='VStack'&&n.children.some(c=>c.type==='HStack'&&c.children.some(x=>clocks.includes(x))))){
    assert.equal(meter.props.alignment,'leading');const usage=meter.children[0];assert.equal(usage.children[0].props.fontWeight,'bold');assert.ok(usage.children[0].props.font>=11);assert.deepEqual(usage.children.slice(-2).map(c=>c.type),['Spacer','Text']);assert.equal(usage.children[0].props.lineLimit,1);assert.equal(usage.children[0].props.minScaleFactor,0.8);
    const row=meter.children.at(-1);assert.equal(row.type,'HStack');assert.equal(row.children.at(-2).type,'Spacer');assert.ok(clocks.includes(row.children.at(-1)),'Countdown is right aligned beside dollar usage');
  }
  // Walk the whole height-allocation chain, not just a center attribute. An
  // intrinsic DATA stack must fill each account's remaining region vertically;
  // header stays outside that expanding region, and the footer outside accounts.
  const centeredData=nodes.filter(n=>n.type==='VStack'&&n.props.frame?.maxHeight==='infinity'&&n.props.frame?.alignment==='center');assert.equal(centeredData.length,invalid?0:count)
  function findPath(root,target,path=[]){if(root===target)return [...path,root];for(const child of root.children||[]){if(typeof child==='object'){const found=findPath(child,target,[...path,root]);if(found)return found}}}
  for(const center of centeredData){assert.equal(center.props.padding,undefined,'Header now sits above DATA in every family');assert.equal(center.props.frame.maxWidth,'infinity');assert.equal(center.children.length,1);const data=center.children[0];assert.equal(data.type,'VStack');assert.equal(data.props.alignment,'leading');assert.equal(data.props.frame.maxWidth,'infinity');assert.equal(data.props.frame.maxHeight,undefined,'DATA retains intrinsic height');assert.ok(!data.children.some(n=>n.type==='Text'&&n.children.some(t=>typeof t==='string'&&t.includes('今日用量：'))),'Daily usage moved outside DATA');const chain=findPath(result.view,center);for(const ancestor of chain.slice(1))assert.equal(ancestor.props.frame?.maxHeight,'infinity','Unbroken full-height chain into DATA region');const headerParent=chain.at(-2);assert.equal(headerParent.children[0].type, 'HStack');assert.ok(headerParent.children[0]!==center,'Header remains above or left of DATA');assert.ok(!data.children.some(n=>n.type==='HStack'&&n.children.some(c=>c.type==='Image')),'Header is not centered with DATA')}
  // Structural compact-fit guard: prefix stays on an existing, shrinkable single line.
  // This is not a native glyph measurement or a guarantee of SwiftUI pixel fit.
  if(family==='systemSmall'||family==='systemMedium'&&count===2||family==='systemLarge'&&count>=3){for(const row of timeRows)assert.ok(row.props.font>=9&&row.props.font<=12)}
  const content=result.view.children[0].children[0];assert.equal(content.props.padding,undefined,'Overlay belongs to content inside a separate inset wrapper');assert.equal(content.props.frame.maxHeight,'infinity');assert.equal(content.children.some(n=>n.type==='Spacer'),invalid,'Only empty state has a trailing Spacer; populated DATA owns remaining height');if(!invalid){assert.equal(content.children.at(-1),footer[0],'Footer stays last and outside expanded accounts');assert.deepEqual(content.children.at(-2).children,daily,'Daily usage immediately above update footer');if(count>1)for(const row of daily)assert.ok(row.children.some(c=>typeof c==='string'&&c.includes(' · 今日用量：')),'Each footer amount has its account name')}
  if(fixture==='single7d'){
    assert.equal(meters.length,count,'Hidden 5h leaves no placeholder meter')
    assert.equal(timeRows.length,count)
    assert.ok(!nodes.some(n=>n.type==='Text'&&n.children.includes('5h')))
    if(family==='systemLarge'&&count===1)assert.ok(nodes.some(n=>n.type==='Text'&&n.props.font===30),'Single weekly large percentage is reduced from 64pt')
    if(family==='systemMedium'&&count===1)assert.ok(nodes.some(n=>n.type==='Text'&&n.props.font===23),'Single weekly medium percentage is reduced from 36pt')
  }
  // Structural distinction and typography hierarchy for every density.
  for(const center of centeredData){
    const composition=center.children[0].children[0];
    const readings=[];function collect(n){if(n?.type==='VStack'&&n.children[0]?.type==='HStack'&&n.children[0].children[0]?.type==='Text'&&['5h','7d'].includes(n.children[0].children[0].children[0]))readings.push(n);for(const c of n?.children||[])if(typeof c==='object')collect(c)}collect(composition)
    if(readings.length===1){assert.equal(composition.type,'VStack');assert.equal(composition.children.length,1,'Single layout has one full-width reading');const label=readings[0].children[0].children[0],value=readings[0].children[0].children.at(-1);assert.ok(label.props.font>=17);assert.ok(value.props.font>=16);assert.ok(value.props.font<=label.props.font,'Percentage must not exceed the primary 7d label');}
    else if(readings.length===2){assert.equal(composition.type,family==='systemSmall'||family==='systemMedium'&&count===2||family==='systemLarge'&&count===1?'VStack':'HStack','Dual layout explicitly chooses paired or stacked windows');}
    for(const reading of readings){
      assert.equal(reading.children[0].props.alignment,'firstTextBaseline','Window label and percentage share a text baseline');
      const mode=family==='systemSmall'?'small':family==='systemMedium'?(count===1?'mediumOne':'mediumTwo'):count===1?'largeOne':count===2?'largeTwo':'largeRows';
      const expected=(readings.length===1?{small:[22,21,11],mediumTwo:[22,21,12],mediumOne:[24,23,15],largeOne:[32,30,22],largeTwo:[26,25,15],largeRows:[17,16,10]}:{small:[13,13,9],mediumTwo:[13,13,9],mediumOne:[20,19,12],largeOne:[25,24,18],largeTwo:[20,19,12],largeRows:[15,14,10]})[mode];
      const [label,value]=[reading.children[0].children[0],reading.children[0].children.at(-1)],clock=reading.children.at(-1).children.at(-1);
      assert.deepEqual([label.props.font,value.props.font,clock.children[1].props.font],expected,'Explicit type scale must preserve enlarged details and subordinate percentage');
      assert.ok(value.props.font<=label.props.font);
      // Approximate ordinary ASCII monospaced row width after allowed 0.75 scaling.
      // Protect compact widths without pretending to measure native glyphs.
      const cardWidth=family==='systemSmall'?127:family==='systemMedium'&&count===2?147.5:305;
      const paired=composition.type==='HStack',width=paired?(cardWidth-14)/2:cardWidth;
      const amountLength='$21.00 / $100.00'.length,timeLength='6d23h'.length;
      const estimate=(amountLength+timeLength)*0.6*expected[2]*0.75+clock.children[0].props.font+2+8;
      assert.ok(estimate<=width,`${mode}: representative amount/countdown scaled width ${estimate} exceeds ${width}`);
    }
  }
  // Conservative intrinsic-height approximation at minimum host sizes. Uses
  // 1.2x font line height and a 4pt native progress bar; no text shrinking. This
  // guards against obvious stack overflow, not SwiftUI or Dynamic Type pixels.
  function height(n){if(!n||typeof n!=='object')return 0;let h=0;const kids=n.children.filter(c=>typeof c==='object');if(n.type==='Text')h=(typeof n.props.font==='number'?n.props.font:17)*1.2;else if(n.type==='Image')h=n.props.frame?.height??n.props.font??17;else if(n.type==='ProgressView')h=4;else if(n.type==='HStack')h=Math.max(0,...kids.map(height));else if(n.type==='VStack')h=kids.reduce((sum,c)=>sum+height(c),0)+Math.max(0,kids.length-1)*(n.props.spacing??8);else if(n.type==='Link'||n.type==='Button')h=Math.max(0,...kids.map(height));const p=n.props.padding;h+=typeof p==='number'?2*p:p?((p.top??p.vertical??0)+(p.bottom??p.vertical??0)):0;return Math.max(h,n.props.frame?.height??0)}
  if(!invalid){const intrinsic=height(result.view.children[0]);assert.ok(intrinsic<=bridge.Widget.displaySize.height-4,`${family}/${count}/${fixture}: conservative intrinsic height ${intrinsic.toFixed(1)} exceeds host ${bridge.Widget.displaySize.height} minus 4pt reserve`)}
  const images=nodes.filter(n=>n.type==='Image'&&!n.props.systemName);assert.equal(images.length,invalid||decoder==='fail'?0:count);for(const image of images){assert.equal(image.props.widgetAccentedRenderingMode,'fullColor');assert.equal(image.props.renderingMode,'original');assert.ok(image.props.image.light.decoded&&image.props.image.dark.decoded);assert.ok(!image.props.filePath);const expectedSize=family==='systemLarge'&&count===1?40:family==='systemLarge'&&count>=3?20:family==='systemSmall'||family==='systemMedium'&&count===2?24:28;assert.equal(image.props.frame.width,expectedSize);assert.equal(image.props.frame.height,expectedSize)}
  for(const n of nodes){assert.ok(!('maxWidth' in (n.props.frame||{}))||!('width' in n.props.frame));assert.ok(!('maxHeight' in (n.props.frame||{}))||!('height' in n.props.frame));if(n.type==='ProgressView')assert.deepEqual(JSON.parse(JSON.stringify(n.props.tint)),{light:'#48484A',dark:'#D1D1D6'})}
  console.log(`${family} / ${count} account(s) / ${decoder} / ${fixture}${invalid?' / error state':''}: view tree passed`)
}
for(const [family,max] of [['systemSmall',1],['systemMedium',2],['systemLarge',4]])for(let n=1;n<=max;n++)render(family,n)
render('systemMedium',2,'file');render('systemMedium',2,'fail');render('systemSmall',1,'embedded',true)
for(const [family,max] of [['systemSmall',1],['systemMedium',2],['systemLarge',4]])for(let n=1;n<=max;n++)render(family,n,'embedded',false,'bothStale')
for(const [family,max] of [['systemSmall',1],['systemMedium',2],['systemLarge',4]])for(let n=1;n<=max;n++)render(family,n,'embedded',false,'single7d')
for(const [family,max] of [['systemSmall',1],['systemMedium',2],['systemLarge',4]])for(let n=1;n<=max;n++)render(family,n,'embedded',false,'bothUnknown')
console.log('31 mocked view-tree checks passed. No native rendering or device verification.')
