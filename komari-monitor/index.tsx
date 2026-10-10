import {
  Navigation,
  NavigationStack,
  NavigationLink,
  List,
  Section,
  VStack,
  HStack,
  Text,
  TextField,
  Picker,
  Button,
  Script,
  useState,
} from 'scripting'
import {
  state,
  speed,
  timeLabel,
  expiry,
  bytes,
  traffic,
  probe,
  ratio,
} from './model'
import { palette, NodeCard, Reading, UpdateNote, SiteBrand } from './ui'
import { Settings } from './settings'
import { Detail } from './detail'
import { useMonitor } from './monitor'
export function Dashboard() {
  const m = useMonitor(),
    dismiss = Navigation.useDismiss(),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [group, setGroup] = useState('all')
  const nodes = m.snapshot.nodes,
    online = nodes.filter(
      (n) => state(n, !!m.snapshot.cached) === 'online',
    ).length,
    offline = nodes.filter(
      (n) => state(n, !!m.snapshot.cached) === 'offline',
    ).length
  const groups = [...new Set(nodes.map((n) => n.group))],
    shown = nodes.filter(
      (n) =>
        (group === 'all' || n.group === group) &&
        (!search ||
          `${n.name} ${n.region} ${n.group} ${n.tags}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (filter === 'all' ||
          (filter === 'focus' &&
            (state(n, !!m.snapshot.cached) !== 'online' ||
              (n.status?.cpu ?? 0) >= 80 ||
              (n.status?.memory ?? 0) >= 85 ||
              (probe(n).loss ?? 0) > 0 ||
              (ratio(traffic(n), n.trafficLimit) ?? 0) >= 90)) ||
          (filter === 'online' && state(n, !!m.snapshot.cached) === 'online')),
    )
  const sorted =
    filter === 'focus'
      ? [...shown].sort(
          (a, b) =>
            Number(state(a) === 'online') - Number(state(b) === 'online') ||
            (b.status?.cpu ?? 0) - (a.status?.cpu ?? 0),
        )
      : shown
  const sum = (direction: 'up' | 'down') => {
    const values = nodes
      .filter((n) =>
        ['online', 'recent'].includes(state(n, !!m.snapshot.cached)),
      )
      .map((n) => n.status?.[direction] ?? null)
      .filter((v): v is number => v !== null)
    return values.length ? values.reduce((a, b) => a + b, 0) : null
  }
  return (
    <List
      navigationTitle={m.snapshot.site?.title || 'Komari 夜航'}
      listStyle="insetGroup"
      navigationBarTitleDisplayMode="inline"
      onAppear={m.appear}
      onDisappear={m.disappear}
      refreshable={m.reload}
      toolbar={{
        cancellationAction: <Button title="完成" action={dismiss} />,
        topBarTrailing: [
          <Button title={m.busy ? '更新中' : '刷新'} action={m.reload} />,
          <NavigationLink destination={<Settings />}>
            <Text>设置</Text>
          </NavigationLink>,
        ],
      }}
    >
      <Section>
        <VStack alignment="leading" spacing={12} padding={{ vertical: 8 }}>
          <HStack>
            <SiteBrand snapshot={m.snapshot} size={18} />
            <Text
              font={10}
              lineLimit={1}
              minScaleFactor={0.7}
              foregroundStyle={m.snapshot.cached ? palette.amber : palette.teal}
            >
              {m.liveNote}
            </Text>
          </HStack>
          <HStack spacing={20}>
            <Reading
              title="在线"
              value={m.snapshot.cached ? '—' : String(online)}
              accent
            />
            <Reading
              title="离线"
              value={m.snapshot.cached ? '—' : String(offline)}
            />
            <Reading title="全部节点" value={String(nodes.length)} />
          </HStack>
          <HStack spacing={18}>
            <Reading title="↓ 当前可读节点合计" value={speed(sum('down'))} />
            <Reading
              title="↑ 当前可读节点合计"
              value={speed(sum('up'))}
              accent
            />
          </HStack>
          <HStack spacing={18}>
            <Reading
              title="累计下载 · 可读节点"
              value={bytes(
                nodes.reduce((sum, n) => sum + (n.status?.totalDown ?? 0), 0) ||
                  (nodes.some((n) => n.status?.totalDown === 0) ? 0 : null),
              )}
            />
            <Reading
              title="累计上传 · 可读节点"
              value={bytes(
                nodes.reduce((sum, n) => sum + (n.status?.totalUp ?? 0), 0) ||
                  (nodes.some((n) => n.status?.totalUp === 0) ? 0 : null),
              )}
              accent
            />
          </HStack>
          <UpdateNote
            time={m.snapshot.fetchedAt}
            cached={m.snapshot.cached}
            demo={m.config.demo}
          />
          {m.snapshot.notice ? (
            <Text font={12} foregroundStyle={palette.muted}>
              {m.snapshot.notice}
            </Text>
          ) : null}
          {nodes.length > online + offline ? (
            <Text font={11} foregroundStyle={palette.muted}>
              {nodes.length - online - offline} 台为近期上报、过期或未知状态
            </Text>
          ) : null}
        </VStack>
      </Section>
      <Section header={<Text>节点监控 / NODES</Text>}>
        <TextField
          title="搜索 VPS"
          prompt="名称、地区、分组、标签"
          value={search}
          onChanged={setSearch}
        />
        <Picker
          title="状态筛选"
          value={filter}
          onChanged={(value) => setFilter(String(value))}
          pickerStyle="segmented"
        >
          <Text tag="all">全部</Text>
          <Text tag="online">在线</Text>
          <Text tag="focus">需关注</Text>
        </Picker>
        <Picker
          title="分组"
          value={group}
          onChanged={(value) => setGroup(String(value))}
        >
          <Text tag="all">全部分组</Text>
          {groups.map((g) => (
            <Text key={g} tag={g}>
              {g}
            </Text>
          ))}
        </Picker>
      </Section>
      {sorted.map((n) => (
        <Section key={n.id}>
          <NavigationLink destination={<Detail id={n.id} />}>
            <VStack alignment="leading" spacing={8} padding={{ vertical: 6 }}>
              <NodeCard node={n} cached={m.snapshot.cached} trend={false} />
              <HStack>
                <Text font={10} foregroundStyle={palette.muted}>
                  {expiry(n.expires)}
                </Text>
                <Text
                  font={10}
                  foregroundStyle={palette.muted}
                >{`上报 ${timeLabel(n.status?.time || '')}`}</Text>
              </HStack>
            </VStack>
          </NavigationLink>
        </Section>
      ))}
      {!sorted.length ? (
        <Section>
          <Text foregroundStyle={palette.muted}>
            {nodes.length
              ? '没有符合筛选条件的节点。'
              : '尚无可见节点，请打开设置连接服务器。'}
          </Text>
          <NavigationLink destination={<Settings />}>
            <Text foregroundStyle={palette.teal}>配置连接与小组件 ›</Text>
          </NavigationLink>
        </Section>
      ) : null}
    </List>
  )
}
async function run() {
  const id =
    typeof Script.queryParameters.node === 'string'
      ? Script.queryParameters.node
      : ''
  await Navigation.present({
    modalPresentationStyle: 'fullScreen',
    element: (
      <NavigationStack>
        {id ? <Detail id={id} home={() => <Dashboard />} /> : <Dashboard />}
      </NavigationStack>
    ),
  })
  Script.exit()
}
run()
