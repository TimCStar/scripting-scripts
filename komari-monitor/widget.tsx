import {
  VStack,
  HStack,
  Text,
  Spacer,
  Widget,
  Script,
  Link,
  Image,
  Button,
} from 'scripting'
import {
  selectedIDs,
  timeLabel,
  percent,
  speed,
  state,
  type Family,
  type Node,
  type Snapshot,
} from './model'
import { readConfig, refresh } from './state'
import {
  palette,
  NodeCard,
  StatusBadge,
  Resource,
  Trend,
  UpdateNote,
} from './ui'
import { RefreshKomariIntent } from './app_intents'

export function WidgetView({
  snapshot,
  family,
  ids,
  notice = '',
  name = Script.name,
}: {
  snapshot: Snapshot
  family: Family
  ids: string[]
  notice?: string
  name?: string
}) {
  const small = family === 'systemSmall',
    large = family === 'systemLarge',
    nodes = ids
      .map((id) => snapshot.nodes.find((n) => n.id === id))
      .filter((n): n is Node => !!n)
  const home = Script.createRunURLScheme(name),
    detail = (id: string) => Script.createRunURLScheme(name, { node: id })
  const usable = nodes.filter(
    (n) => state(n, !!snapshot.cached) === 'online',
  ).length
  const title = (
    <HStack spacing={5}>
      <Image
        systemName="waveform.path"
        font={12}
        foregroundStyle={palette.teal}
      />
      <Text font={10} fontWeight="semibold" foregroundStyle={palette.muted}>
        KOMARI / 夜航
      </Text>
      <Spacer />
    </HStack>
  )
  const header = (
    <HStack spacing={8}>
      <Link url={home}>{title}</Link>
      <Button
        buttonStyle="plain"
        intent={RefreshKomariIntent({
          family,
          parameter: ids.join(','),
          revision: readConfig().revision,
        })}
      >
        <Image
          systemName="arrow.clockwise"
          font={11}
          foregroundStyle={palette.muted}
          frame={{ width: 22, height: 22 }}
        />
      </Button>
    </HStack>
  )
  const footer = (
    <HStack spacing={4}>
      <UpdateNote
        time={snapshot.fetchedAt}
        cached={snapshot.cached}
        demo={snapshot.transport === 'demo'}
      />
      <Spacer />
      {!small ? (
        <Link url={home}>
          <Text
            font={9}
            foregroundStyle={palette.teal}
          >{`全部 ${snapshot.nodes.length} 台 ›`}</Text>
        </Link>
      ) : null}
    </HStack>
  )
  const solo = nodes[0],
    s = solo?.status
  return (
    <VStack
      spacing={0}
      frame={Widget.displaySize}
      widgetBackground={palette.gradient}
      widgetURL={small ? home : undefined}
    >
      <VStack
        alignment="leading"
        spacing={small ? 4 : large ? 10 : 6}
        padding={{ horizontal: small ? 14 : 16, vertical: small ? 10 : 12 }}
        frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      >
        {small ? title : header}
        {!nodes.length ? (
          <VStack alignment="leading" spacing={8}>
            <Text font={16} fontWeight="semibold" foregroundStyle={palette.ink}>
              连接你的云端
            </Text>
            <Text font={11} foregroundStyle={palette.muted}>
              {notice || snapshot.notice || '打开脚本，在设置里选择 VPS。'}
            </Text>
            <Spacer />
          </VStack>
        ) : small ? (
          <VStack
            alignment="leading"
            spacing={2}
            frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
          >
            <HStack spacing={4}>
              <Text
                font={14}
                fontWeight="semibold"
                foregroundStyle={palette.ink}
                lineLimit={1}
                minScaleFactor={0.65}
              >
                {solo.name}
              </Text>
              <Spacer />
            </HStack>
            <StatusBadge node={solo} cached={snapshot.cached} compact />
            <HStack alignment="firstTextBaseline" spacing={3}>
              <Text
                font={Widget.displaySize.height < 160 ? 30 : 36}
                fontWeight="semibold"
                monospacedDigit
                foregroundStyle={palette.ink}
                lineLimit={1}
                minScaleFactor={0.8}
              >
                {percent(s?.cpu ?? null)}
              </Text>
              <Text font={9} foregroundStyle={palette.muted}>
                CPU
              </Text>
              <Spacer />
            </HStack>
            <HStack spacing={8}>
              <Text font={9} foregroundStyle={palette.muted}>
                内存 {percent(s?.memory ?? null)}
              </Text>
              <Spacer />
              <Text font={9} foregroundStyle={palette.muted}>
                磁盘 {percent(s?.disk ?? null)}
              </Text>
            </HStack>
            <Spacer />
            <Text
              font={9}
              monospacedDigit
              foregroundStyle={palette.teal}
              lineLimit={1}
              minScaleFactor={0.7}
            >
              ↓ {speed(s?.down ?? null)}
            </Text>
          </VStack>
        ) : !large ? (
          <HStack
            alignment="top"
            spacing={16}
            frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
          >
            {nodes.map((n) => (
              <Link key={n.id} url={detail(n.id)}>
                <VStack
                  frame={{
                    maxWidth: 'infinity',
                    maxHeight: 'infinity',
                    alignment: 'center',
                  }}
                >
                  <NodeCard
                    node={n}
                    cached={snapshot.cached}
                    dense
                    trend={false}
                  />
                  {nodes.length === 1 ? (
                    <Trend
                      history={n.history}
                      height={25}
                      muted={snapshot.cached}
                    />
                  ) : null}
                </VStack>
              </Link>
            ))}
          </HStack>
        ) : (
          <VStack
            alignment="leading"
            spacing={nodes.length > 2 ? 9 : 14}
            frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
          >
            <HStack alignment="firstTextBaseline">
              <Text
                font={23}
                fontWeight="semibold"
                monospacedDigit
                foregroundStyle={palette.ink}
              >
                {snapshot.cached ? '—' : usable}
              </Text>
              <Text font={11} foregroundStyle={palette.muted}>
                {' '}
                / {nodes.length} 关注节点在线
              </Text>
              <Spacer />
            </HStack>
            {nodes.length <= 2 ? (
              nodes.map((n) => (
                <Link key={n.id} url={detail(n.id)}>
                  <VStack
                    spacing={0}
                    frame={{
                      maxWidth: 'infinity',
                      maxHeight: 'infinity',
                      alignment: 'center',
                    }}
                  >
                    <NodeCard
                      node={n}
                      cached={snapshot.cached}
                      dense={nodes.length === 2}
                    />
                  </VStack>
                </Link>
              ))
            ) : (
              <VStack
                spacing={10}
                frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
              >
                {[nodes.slice(0, 2), nodes.slice(2, 4)].map((row, i) => (
                  <HStack
                    key={String(i)}
                    alignment="top"
                    spacing={16}
                    frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
                  >
                    {row.map((n) => (
                      <Link key={n.id} url={detail(n.id)}>
                        <VStack
                          frame={{
                            maxWidth: 'infinity',
                            maxHeight: 'infinity',
                            alignment: 'center',
                          }}
                        >
                          <NodeCard node={n} cached={snapshot.cached} dense />
                        </VStack>
                      </Link>
                    ))}
                    {row.length === 1 ? (
                      <VStack frame={{ maxWidth: 'infinity' }} />
                    ) : null}
                  </HStack>
                ))}
              </VStack>
            )}
          </VStack>
        )}
        {nodes.length &&
        (notice || snapshot.notice) &&
        snapshot.transport !== 'demo' ? (
          <Text
            font={8}
            foregroundStyle={palette.muted}
            lineLimit={1}
            minScaleFactor={0.7}
          >
            {notice || snapshot.notice}
          </Text>
        ) : null}
        {footer}
      </VStack>
    </VStack>
  )
}
async function run() {
  const config = readConfig(),
    family: Family =
      Widget.family === 'systemSmall'
        ? 'systemSmall'
        : Widget.family === 'systemLarge'
          ? 'systemLarge'
          : 'systemMedium'
  const snapshot = await refresh(config, family, Widget.parameter || '')
  let ids: string[] = [],
    notice = ''
  try {
    ids = selectedIDs(config, snapshot.nodes, family, Widget.parameter || '')
  } catch (e) {
    notice = e instanceof Error ? e.message : '组件参数无效'
  }
  Widget.present(
    <WidgetView
      snapshot={snapshot}
      family={family}
      ids={ids}
      notice={notice}
    />,
    {
      policy: 'after',
      date: new Date(Date.now() + config.refreshMinutes * 60_000),
    },
  )
}
run()
