// Executing TSX in a test bridge verifies view structure, never native SwiftUI pixels.
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript')
function harness({
  family = 'systemSmall',
  width = 155,
  height = 155,
  config,
  fetcher,
  failStorage = false,
} = {}) {
  const modules = {},
    data = new Map(config ? [['komari.config.v1', config]] : []),
    keys = new Map(),
    result = {},
    effects = []
  const jsx = (type, props, ...children) =>
    typeof type === 'function'
      ? type({ ...props, children })
      : {
          type,
          props: props || {},
          children: children
            .flat(Infinity)
            .filter((x) => x !== undefined && x !== null && x !== false),
        }
  const bridge = {
    Script: {
      name: 'Komari 夜航',
      queryParameters: {},
      createRunURLScheme: (name, p) =>
        'scripting://run/' +
        encodeURIComponent(name) +
        (p ? '?node=' + encodeURIComponent(p.node) : ''),
      exit() {
        result.exited = true
      },
    },
    Widget: {
      family,
      displaySize: { width, height },
      parameter: '',
      present(view, policy) {
        result.view = view
        result.policy = policy
      },
      reloadAll() {
        result.reloads = (result.reloads || 0) + 1
      },
      preview: async () => {},
    },
    AppIntentManager: {
      register: (d) => (p) => ({ definition: d, params: p }),
    },
    AppIntentProtocol: { AppIntent: 'AppIntent' },
    fetch:
      fetcher ||
      (() => {
        throw Error('Unexpected network')
      }),
    Navigation: {
      useDismiss: () => () => {},
      present: async (v) => {
        result.page = v.element
      },
    },
    useState: (x) => [typeof x === 'function' ? x() : x, () => {}],
    useEffect: (fn) => effects.push(fn),
  }
  for (const n of [
    'VStack',
    'HStack',
    'Text',
    'Spacer',
    'Image',
    'ProgressView',
    'Link',
    'Button',
    'Chart',
    'LineChart',
    'List',
    'Section',
    'Picker',
    'Toggle',
    'TextField',
    'SecureField',
    'Form',
    'NavigationLink',
    'NavigationStack',
  ])
    bridge[n] = n
  const globals = {
    jsx,
    Fragment: 'Fragment',
    Date,
    JSON,
    URL,
    console,
    setTimeout,
    clearTimeout,
    Storage: {
      get: (k) => data.get(k) ?? null,
      set: (k, v) => {
        if (failStorage) return false
        data.set(k, v)
        return true
      },
    },
    Keychain: {
      get: (k) => keys.get(k) ?? null,
      set: (k, v) => {
        keys.set(k, v)
        return true
      },
      remove: (k) => keys.delete(k),
    },
  }
  function load(name) {
    const file = path.resolve(__dirname, '..', name)
    if (modules[file]) return modules[file].exports
    const module = { exports: {} }
    modules[file] = module
    let source = fs
      .readFileSync(file, 'utf8')
      .replace(/^run\(\)\s*$/m, 'globalThis.completion=run()')
    const code = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        jsxFactory: 'jsx',
        jsxFragmentFactory: 'Fragment',
      },
    }).outputText
    vm.runInNewContext(
      `(function(require,module,exports){${code}\n})`,
      globals,
      { filename: file },
    )(
      (n) => {
        if (n === 'scripting') return bridge
        const p = path.resolve(path.dirname(file), n)
        return load(fs.existsSync(p + '.ts') ? p + '.ts' : p + '.tsx')
      },
      module,
      module.exports,
    )
    return module.exports
  }
  return { load, bridge, globals, data, keys, result, effects, jsx }
}
function walk(node, result = []) {
  if (!node || typeof node !== 'object') return result
  result.push(node)
  for (const c of node.children || []) walk(c, result)
  return result
}
module.exports = { harness, walk }
