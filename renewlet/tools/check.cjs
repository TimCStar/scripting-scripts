const fs = require('node:fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict')
let errors = 0
const files = fs.readdirSync('.').filter((n) => /\.tsx?$/.test(n))
for (const file of files) {
  const r = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.Preserve,
    },
  })
  for (const d of r.diagnostics || [])
    if (d.category === ts.DiagnosticCategory.Error) {
      errors++
      console.error(file, ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    }
}
const m = JSON.parse(fs.readFileSync('script.json'))
for (const key of ['name', 'icon', 'color', 'version'])
  assert.equal(typeof m[key], 'string')
assert(
  !/https?:\/\/[^'"\s]+/.test(fs.readFileSync('state.ts', 'utf8')),
  'No hardcoded runtime server',
)
console.log(
  `${files.length} runtime files syntax checked; manifest checked. Native API type verification requires device-synced Scripting declarations.`,
)
process.exitCode = errors ? 1 : 0
