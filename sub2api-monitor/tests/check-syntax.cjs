// Syntax only: deliberately no invented Scripting API declarations.
const ts = require('typescript')
const fs = require('node:fs')
let errors = 0
for (const file of fs.readdirSync('.').filter(name => /\.tsx?$/.test(name))) {
  const result = ts.transpileModule(fs.readFileSync(file,'utf8'), {fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022}})
  for (const diagnostic of result.diagnostics || []) {
    if(diagnostic.category===ts.DiagnosticCategory.Error)errors++
    console.error(file,ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n'))
  }
  console.log(file+': syntax checked')
}
process.exitCode=errors?1:0
