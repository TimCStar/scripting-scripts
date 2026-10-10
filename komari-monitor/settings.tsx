import {
  Form,
  Section,
  Text,
  TextField,
  SecureField,
  Picker,
  Toggle,
  Button,
  Widget,
  useState,
} from 'scripting'
import {
  families,
  capacity,
  normalizeURL,
  demoSnapshot,
  type Config,
  type Family,
  type Node,
} from './model'
import { KomariClient, errorMessage } from './client'
import { fetch } from 'scripting'
import { readConfig, readToken, saveConfig, removeToken } from './state'
const sizeName = {
  systemSmall: '小号 · 1 台',
  systemMedium: '中号 · 1–2 台',
  systemLarge: '大号 · 1–4 台',
}
export function Settings() {
  const initial = readConfig(),
    [url, setURL] = useState(initial.baseURL),
    [token, setToken] = useState(''),
    [demo, setDemo] = useState(initial.demo),
    [minutes, setMinutes] = useState(initial.refreshMinutes)
  const [nodes, setNodes] = useState<Node[]>(() =>
      initial.demo ? demoSnapshot().nodes : [],
    ),
    [loadedBase, setLoadedBase] = useState(initial.demo ? 'demo' : ''),
    [selections, setSelections] = useState(initial.selections),
    [family, setFamily] = useState<Family>('systemSmall'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      '先读取节点，再勾选各尺寸要显示的 VPS。勾选顺序就是显示顺序。',
    )
  function draft(): Config {
    return {
      ...initial,
      baseURL: demo ? url : normalizeURL(url),
      demo,
      refreshMinutes: minutes,
      selections,
      revision: String(Date.now()),
    }
  }
  async function load() {
    if (busy) return
    setBusy(true)
    try {
      const c = draft()
      const s = demo
        ? demoSnapshot()
        : await new KomariClient(
            c.baseURL,
            token.trim() || readToken(c),
            fetch,
          ).snapshot()
      setNodes(s.nodes)
      setLoadedBase(demo ? 'demo' : c.baseURL)
      if (
        (demo ? 'demo' : c.baseURL) !==
        (initial.demo ? 'demo' : initial.baseURL)
      )
        setSelections({ systemSmall: [], systemMedium: [], systemLarge: [] })
      else {
        const visible = new Set(s.nodes.map((n) => n.id))
        setSelections({
          systemSmall: selections.systemSmall.filter((id) => visible.has(id)),
          systemMedium: selections.systemMedium.filter((id) => visible.has(id)),
          systemLarge: selections.systemLarge.filter((id) => visible.has(id)),
        })
      }
      setMessage(
        `已读取 ${s.nodes.length} 台 VPS。可以选择组件节点，再点保存。`,
      )
    } catch (e) {
      setMessage(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  function save() {
    if (busy) return
    try {
      const c = draft()
      if (loadedBase !== (demo ? 'demo' : c.baseURL))
        throw new Error('请先读取当前站点的节点')
      const ids = nodes.map((n) => n.id)
      for (const f of families)
        c.selections[f] = selections[f].filter((id) => ids.includes(id))
      saveConfig(c, demo ? '' : token)
      setToken('')
      setMessage('已保存。返回总览后自动刷新；可在下方预览组件。')
      Widget.reloadAll()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    }
  }
  return (
    <Form navigationTitle="夜航设置" navigationBarTitleDisplayMode="inline">
      <Section header={<Text>连接 Komari</Text>}>
        <Toggle
          title="演示模式 · 虚构数据"
          value={demo}
          onChanged={(value) => {
            setDemo(value)
            setLoadedBase('')
            setNodes([])
          }}
        />
        <TextField
          title="站点 HTTPS 地址"
          prompt="https://komari.example.com"
          value={url}
          onChanged={(value) => {
            setURL(value)
            setLoadedBase('')
          }}
        />
        <SecureField
          title="API Key（可选，留空保留）"
          value={token}
          onChanged={setToken}
        />
        <Text>
          公开站点可留空；私有站点使用 Komari API
          Key。填写站点根地址或部署子路径，不要添加 /api。
        </Text>
        <Button title={busy ? '读取中…' : '读取节点'} action={load} />
      </Section>
      <Section header={<Text>选择小组件 VPS</Text>}>
        <Picker
          title="组件尺寸"
          value={family}
          onChanged={(value) => {
            if (families.includes(value as Family)) setFamily(value as Family)
          }}
        >
          {families.map((f) => (
            <Text key={f} tag={f}>
              {sizeName[f]}
            </Text>
          ))}
        </Picker>
        <Text>
          已选 {selections[family].length}/{capacity(family)}
          。不勾选时，使用服务器排序的前 {capacity(family)} 台。
        </Text>
        {nodes.map((n) => (
          <Toggle
            key={n.id}
            title={`${selections[family].includes(n.id) ? `${selections[family].indexOf(n.id) + 1}. ` : ''}${n.name} · ${n.region}`}
            value={selections[family].includes(n.id)}
            onChanged={(value) => {
              const ids = selections[family]
              if (value && ids.length >= capacity(family)) {
                setMessage(`此尺寸最多 ${capacity(family)} 台，请先取消一个。`)
                return
              }
              setSelections({
                ...selections,
                [family]: value
                  ? [...ids, n.id]
                  : ids.filter((id) => id !== n.id),
              })
            }}
          />
        ))}
      </Section>
      <Section header={<Text>更新与保存</Text>}>
        <Picker
          title="组件申请刷新间隔"
          value={minutes}
          onChanged={(value) => setMinutes(Number(value))}
        >
          {[5, 15, 30, 60].map((m) => (
            <Text key={String(m)} tag={m}>
              {m} 分钟
            </Text>
          ))}
        </Picker>
        <Text>
          全屏面板在前台约每 3 秒更新，后台暂停；历史曲线约每分钟更新。 小组件由
          iOS 决定实际刷新时机。站点标题与图标自动读取。
        </Text>
        <Button title="保存设置" action={save} />
        <Text>{message}</Text>
      </Section>
      <Section header={<Text>组件预览</Text>}>
        {families.map((f) => (
          <Button
            key={f}
            title={sizeName[f]}
            action={() =>
              Widget.preview({
                family: f,
                parameters: {
                  options: { 已保存选择: '' },
                  default: '已保存选择',
                },
              })
            }
          />
        ))}
        <Text>
          保存后预览；在主屏幕添加 Scripting 组件并选择「Komari
          夜航」。也可在组件参数填写 UUID，逗号分隔，以覆盖该组件的默认选择。
        </Text>
      </Section>
      <Section header={<Text>本机凭证</Text>}>
        <Text>
          API Key
          绑定站点地址，仅存本机钥匙串。若要切换为公开访问，删除该站点凭证后重新读取、保存。
        </Text>
        <Button
          title="移除已保存站点的凭证和缓存"
          role="destructive"
          action={() => {
            try {
              removeToken(readConfig())
              setToken('')
              setMessage('已移除该站点凭证和缓存。')
              Widget.reloadAll()
            } catch (e) {
              setMessage(e instanceof Error ? e.message : '删除失败')
            }
          }}
        />
      </Section>
    </Form>
  )
}
