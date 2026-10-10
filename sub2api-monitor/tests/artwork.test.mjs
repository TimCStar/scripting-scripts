import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'sub2api-artwork-'))
for(const file of ['provider-images.ts','provider-artwork.ts'])await writeFile(join(dir,file),(await readFile(new URL('../'+file,import.meta.url),'utf8')).replaceAll("from './provider-artwork'","from './provider-artwork.ts'"))
const {loadProviderArtwork}=await import(pathToFileURL(join(dir,'provider-images.ts')))
const {PROVIDER_ARTWORK}=await import(pathToFileURL(join(dir,'provider-artwork.ts')))
test.after(()=>rm(dir,{recursive:true,force:true}))
test('embedded images exactly match all six authentic offline PNGs',async()=>{for(const [key,modes] of Object.entries(PROVIDER_ARTWORK))for(const [mode,data] of Object.entries(modes)){const png=await readFile(new URL(`../assets/${key}-${mode}.png`,import.meta.url));assert.deepEqual(Buffer.from(data,'base64'),png);assert.equal(png.subarray(1,4).toString(),'PNG')}})
test('embedded images decode synchronously without file or network access',()=>{let count=0;const r=loadProviderArtwork(()=>{throw new Error('must not read files')},data=>({data,id:++count}),()=>{throw new Error('must not need paths')});assert.equal(count,6);assert.deepEqual(r.failed,[]);assert.equal(Object.keys(r.images).length,3);for(const pair of Object.values(r.images)){assert.ok(pair.light);assert.ok(pair.dark)}})
test('null embedded decoder falls back to genuine file image',()=>{let count=0;const r=loadProviderArtwork(path=>({path,id:++count}),()=>null,name=>'/script/assets/'+name);assert.equal(count,6);assert.deepEqual(r.failed,[]);assert.equal(r.images.claude.dark.path,'/script/assets/claude-dark.png')})
test('thrown embedded decoder safely falls back',()=>{const r=loadProviderArtwork(path=>({path}),()=>{throw new Error('decode')},name=>name);assert.deepEqual(r.failed,[]);assert.ok(r.images.openai)})
test('both decode failures recorded rather than fake images or crash',()=>{const r=loadProviderArtwork(()=>null,()=>null,name=>name);assert.deepEqual(r.images,{});assert.deepEqual(r.failed,['openai','claude','antigravity'])})
test('one missing appearance never produces incomplete dynamic image source',()=>{let call=0;const r=loadProviderArtwork(()=>null,()=>++call===2?null:{call},name=>name);assert.equal(r.images.openai,undefined);assert.deepEqual(r.failed,['openai']);assert.ok(r.images.claude)})
test('root is full-size and neutral; original icons are preloaded with fullColor rendering',async()=>{const w=await readFile(new URL('../widget.tsx',import.meta.url),'utf8'),i=await readFile(new URL('../provider-icons.tsx',import.meta.url),'utf8'),s=await readFile(new URL('../index.tsx',import.meta.url),'utf8');assert.match(w,/const view=<VStack spacing=\{0\} frame=\{Widget.displaySize\} widgetBackground=\{bg\}/);assert.ok(!w.includes('brand('));assert.ok(w.indexOf('const artwork=preloadProviderIcons()')<w.indexOf('Widget.present(view'));assert.ok(!i.includes('filePath='));assert.ok(i.includes('widgetAccentedRenderingMode="fullColor"'));assert.ok(i.includes('image={image}'));assert.ok(s.includes('预览 · v1.2.1'));assert.ok(s.includes('图标解码失败'));assert.ok(!w.includes('v1.1.3'))})
