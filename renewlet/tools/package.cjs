const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  { zipSync, unzipSync } = require('fflate')
const root = path.resolve(__dirname, '..'),
  dist = path.join(root, 'dist')
fs.mkdirSync(dist, { recursive: true })
const runtime = fs
  .readdirSync(root)
  .filter(
    (n) =>
      /\.tsx?$/.test(n) ||
      [
        'script.json',
        'README.md',
        'VERIFICATION.md',
        'LICENSE',
        'RENEWLET-LICENSE',
        'ATTRIBUTION.md',
      ].includes(n),
  )
const payload = Object.fromEntries(
  runtime.map((n) => [n, new Uint8Array(fs.readFileSync(path.join(root, n)))]),
)
for (const name of ['index.tsx', 'widget.tsx', 'script.json'])
  assert(name in payload)
function collect(dir, prefix = '', result = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      ['node_modules', 'dist', 'output'].includes(e.name) ||
      e.name.startsWith('.')
    )
      continue
    const key = prefix + e.name
    if (e.isDirectory()) collect(path.join(dir, e.name), key + '/', result)
    else result[key] = new Uint8Array(fs.readFileSync(path.join(dir, e.name)))
  }
  return result
}
function pack(name, files) {
  const zip = zipSync(files, { level: 9 }),
    decoded = unzipSync(zip)
  for (const [k, v] of Object.entries(files))
    assert.deepEqual(Buffer.from(decoded[k]), Buffer.from(v), k)
  fs.writeFileSync(path.join(dist, name), zip)
  return {
    sha256: crypto.createHash('sha256').update(zip).digest('hex'),
    bytes: zip.length,
    files: Object.keys(decoded).length,
  }
}
const checksums = {
  'Renewlet.scripting': pack('Renewlet.scripting', payload),
  'Renewlet-source.zip': pack('Renewlet-source.zip', collect(root)),
}
fs.writeFileSync(
  path.join(dist, 'checksums.json'),
  JSON.stringify(checksums, null, 2) + '\n',
)
for (const n of ['README.md', 'VERIFICATION.md'])
  fs.copyFileSync(path.join(root, n), path.join(dist, n))
console.log(checksums)
