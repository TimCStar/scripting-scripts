const fs = require('node:fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict')
const files = fs.readdirSync('.').filter((n) => /\.tsx?$/.test(n))
let errors = 0
for (const file of files) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.Preserve,
    },
  })
  for (const d of result.diagnostics || []) {
    if (d.category === ts.DiagnosticCategory.Error) {
      errors++
      console.error(file, ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    }
  }
}
const manifest = JSON.parse(fs.readFileSync('script.json'))
for (const key of ['name', 'icon', 'color', 'version'])
  assert.equal(typeof manifest[key], 'string')
assert(
  !/https?:\/\/[^'"\s]+/.test(fs.readFileSync('state.ts', 'utf8')),
  'No hard-coded server in runtime state',
)
console.log(
  `${files.length} runtime files syntax checked; manifest checked. Scripting host types require device-synced declarations.`,
)
process.exitCode = errors ? 1 : 0
