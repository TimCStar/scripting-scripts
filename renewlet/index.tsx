import {
  Navigation,
  NavigationStack,
  NavigationLink,
  List,
  Section,
  Text,
  TextField,
  Picker,
  Button,
  Script,
  useState,
} from 'scripting'
import {
  readConfig,
  initial,
  refresh,
  readSort,
  saveSort,
  loadLogos,
} from './state'
import {
  today,
  upcoming,
  dueFor,
  sorted,
  sorts,
  type Sort,
  type Config,
} from './model'
import { palette, SubscriptionRow, Overview } from './ui'
import { Settings } from './settings'
import { Detail } from './detail'
import { Editor } from './editor'
export function Dashboard() {
  const [config, setConfig] = useState<Config>(readConfig),
    [snapshot, setSnapshot] = useState(() => initial(config)),
    [sort, setSort] = useState(readSort),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [gate] = useState(() => ({ active: true, serial: 0, busy: false })),
    dismiss = Navigation.useDismiss()
  async function reload() {
    if (gate.busy) return
    gate.busy = true
    setBusy(true)
    const serial = ++gate.serial,
      c = readConfig()
    setConfig(c)
    // Hide the previous account's snapshot immediately when a connection changes.
    if (c.revision !== config.revision) setSnapshot(initial(c))
    try {
      const fresh = await refresh(c)
      if (
        gate.active &&
        serial === gate.serial &&
        readConfig().revision === c.revision
      ) {
        setSnapshot(fresh)
        // Refresh already-mounted rows too, without holding the page's refresh lock.
        loadLogos(
          c,
          sorted(fresh.subscriptions, readSort(), today(c.zone)).slice(0, 40),
        ).then(() => {
          if (
            gate.active &&
            serial === gate.serial &&
            readConfig().revision === c.revision
          )
            setSnapshot({ ...fresh })
        })
      }
    } finally {
      if (serial === gate.serial) {
        gate.busy = false
        if (gate.active) setBusy(false)
      }
    }
  }
  async function add() {
    await Navigation.present({
      element: (
        <NavigationStack>
          <Editor config={config} />
        </NavigationStack>
      ),
    })
    await reload()
  }
  const date = today(config.zone),
    nextIDs = new Set(
      upcoming(snapshot.subscriptions, date, config.days).map(
        (d) => d.subscription.id,
      ),
    )
  const shown = sorted(
    snapshot.subscriptions.filter(
      (s) =>
        (filter === 'all' ||
          (filter === 'upcoming' && nextIDs.has(s.id)) ||
          (filter === 'overdue' && (dueFor(s, date)?.days ?? 0) < 0)) &&
        (!search ||
          `${s.name} ${s.category} ${s.tags.join(' ')} ${s.currency}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    ),
    sort,
    date,
  )
  return (
    <List
      navigationTitle="Renewlet"
      navigationBarTitleDisplayMode="inline"
      onAppear={() => {
        gate.active = true
        reload()
      }}
      onDisappear={() => {
        gate.active = false
        gate.serial++
        gate.busy = false
      }}
      refreshable={reload}
      toolbar={{
        cancellationAction: <Button title="完成" action={dismiss} />,
        topBarTrailing: [
          <Button
            title={busy ? '同步中' : '刷新'}
            action={reload}
            disabled={busy}
          />,
          <Button
            title="添加"
            action={add}
            disabled={config.mode === 'public' || busy}
          />,
          <NavigationLink destination={<Settings />}>
            <Text>设置</Text>
          </NavigationLink>,
        ],
      }}
    >
      <Section>
        <Overview snapshot={snapshot} config={config} date={date} />
      </Section>
      <Section header={<Text>全部订阅</Text>}>
        <TextField
          title="搜索订阅"
          prompt="名称、分类、币种"
          value={search}
          onChanged={setSearch}
        />
        <Picker
          title="筛选"
          value={filter}
          onChanged={(v) => setFilter(String(v))}
          pickerStyle="segmented"
        >
          <Text tag="all">全部</Text>
          <Text tag="upcoming">即将到期</Text>
          <Text tag="overdue">逾期待确认</Text>
        </Picker>
        <Picker
          title="排序（记忆上次选择）"
          value={sort}
          onChanged={(v) => {
            try {
              saveSort(v as Sort)
              setSort(v as Sort)
              setMessage('')
            } catch {
              setMessage('排序保存失败，请重试')
            }
          }}
        >
          {Object.entries(sorts).map(([k, v]) => (
            <Text key={k} tag={k}>
              {v}
            </Text>
          ))}
        </Picker>
        {message ? <Text foregroundStyle={palette.red}>{message}</Text> : null}
      </Section>
      {shown.map((s) => (
        <Section key={s.id}>
          <NavigationLink destination={<Detail id={s.id} />}>
            <SubscriptionRow s={s} date={date} />
          </NavigationLink>
        </Section>
      ))}
      {!shown.length ? (
        <Section>
          <Text foregroundStyle={palette.muted}>
            {snapshot.subscriptions.length
              ? '这里暂时没有符合条件的订阅。'
              : '还没有订阅，先连接账本或添加第一笔。'}
          </Text>
          {config.mode === 'public' ? (
            <NavigationLink destination={<Settings />}>
              <Text foregroundStyle={palette.accent}>
                配置连接 / 登录后添加 ›
              </Text>
            </NavigationLink>
          ) : (
            <Button title="添加第一笔订阅" action={add} />
          )}
        </Section>
      ) : null}
      <Section>
        <Text font={11} foregroundStyle={palette.muted}>
          组件按到期日固定排序。主列表保留所有状态，当前排序：{sorts[sort]}
          。标价是每周期总价，自动续订标记不代表已扣款。
        </Text>
        {config.mode === 'public' ? (
          <Text font={11} foregroundStyle={palette.muted}>
            当前只读 · 设置中登录后可添加和编辑。
          </Text>
        ) : null}
      </Section>
    </List>
  )
}
async function run() {
  const id =
    typeof Script.queryParameters.subscription === 'string'
      ? Script.queryParameters.subscription
      : ''
  await Navigation.present({
    element: (
      <NavigationStack>
        {id ? <Detail id={id} home={() => <Dashboard />} /> : <Dashboard />}
      </NavigationStack>
    ),
  })
  Script.exit()
}
run()
