// Simulated Scripting host: executable view trees, not native SwiftUI verification.
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript')
function harness({
  config,
  fetcher,
  failStorage = false,
  family = 'systemSmall',
  width = 155,
  height = 155,
} = {}) {
  const modules = {},
    data = new Map(config ? [['renewlet.config.v1', config]] : []),
    keys = new Map(),
    result = {}
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
      name: 'Renewlet 续订手札',
      queryParameters: {},
      createRunURLScheme: (name, p) =>
        'scripting://run/' +
        encodeURIComponent(name) +
        (p ? '?subscription=' + encodeURIComponent(p.subscription) : ''),
      exit: () => {
        result.exited = true
      },
    },
    Widget: {
      family,
      displaySize: { width, height },
      parameter: '',
      present: (v, p) => {
        result.view = v
        result.policy = p
      },
      reloadAll: () => {
        result.reloads = (result.reloads || 0) + 1
      },
      preview: async () => {},
    },
    Navigation: {
      useDismiss: () => () => {
        result.dismissed = true
      },
      present: async (p) => {
        result.page = p.element
      },
    },
    Dialog: {
      confirm: async () => true,
      prompt: async () => null,
      actionSheet: async () => 0,
    },
    useState: (x) => [typeof x === 'function' ? x() : x, () => {}],
    fetch:
      fetcher ||
      (() => {
        throw Error('Unexpected network')
      }),
    UIImage: {
      fromData: (data) =>
        data?.raster
          ? {
              preparingThumbnail() {
                return this
              },
              toPNGData() {
                return data
              },
              source:
                data.source || 'data:image/png;base64,' + data.toBase64String(),
            }
          : null,
    },
  }
  for (const n of [
    'VStack',
    'HStack',
    'Text',
    'Spacer',
    'Image',
    'SVG',
    'ProgressView',
    'Link',
    'Button',
    'List',
    'Section',
    'Picker',
    'Toggle',
    'DatePicker',
    'TextField',
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
    Intl,
    console,
    Storage: {
      get: (k) => data.get(k) ?? null,
      set: (k, v) => {
        if (failStorage) return false
        data.set(k, v)
        return true
      },
      getData: (k) => data.get(k) ?? null,
      setData: (k, v) => {
        if (!failStorage) data.set(k, v)
      },
      keys: () => [...data.keys()],
      remove: (k) => data.delete(k),
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
    const source = fs
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
  function renderComponent(component, props = {}) {
    const slots = []
    let cursor = 0
    const render = () => {
      cursor = 0
      const previous = bridge.useState
      bridge.useState = (x) => {
        const i = cursor++
        if (!(i in slots)) slots[i] = typeof x === 'function' ? x() : x
        return [
          slots[i],
          (v) => {
            slots[i] = typeof v === 'function' ? v(slots[i]) : v
          },
        ]
      }
      try {
        return component(props)
      } finally {
        bridge.useState = previous
      }
    }
    return { render, slots }
  }
  return { load, data, keys, result, globals, bridge, jsx, renderComponent }
}
function walk(n, out = []) {
  if (!n || typeof n !== 'object') return out
  out.push(n)
  for (const c of n.children || []) walk(c, out)
  return out
}
module.exports = { harness, walk }
