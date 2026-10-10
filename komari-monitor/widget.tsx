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
  percent,
  speed,
  state,
  uptime,
  probe,
  type Family,
  type Node,
  type Snapshot,
} from './model'
import { readConfig, refresh } from './state'
import {
  palette,
  StatusBadge,
  Trend,
  UpdateNote,
  SiteBrand,
  TrafficMeter,
  ProbeReading,
} from './ui'
import { RefreshKomariIntent } from './app_intents'

function widgetScale(family: Family) {
  const width = family === 'systemSmall' ? 155 : 329,
    height = family === 'systemLarge' ? 345 : 155
  return Math.max(
    1,
    Math.min(
      1.2,
      Widget.displaySize.width / width,
      Widget.displaySize.height / height,
    ),
  )
}
function WidgetResources({
  node,
  size,
  labelSize = 9,
}: {
  node: Node
  size: number
  labelSize?: number
}) {
  const readings: [string, number | null | undefined][] = [
    ['CPU', node.status?.cpu],
    ['内存', node.status?.memory],
    ['磁盘', node.status?.disk],
  ]
  return (
    <HStack spacing={6}>
      {readings.map(([label, value], i) => (
        <VStack
          key={String(label)}
          alignment={i === 0 ? 'leading' : i === 1 ? 'center' : 'trailing'}
          spacing={1}
          frame={{
            maxWidth: 'infinity',
            alignment: i === 0 ? 'leading' : i === 1 ? 'center' : 'trailing',
          }}
        >
          <Text font={labelSize} foregroundStyle={palette.muted}>
            {label}
          </Text>
          <Text
            font={size}
            fontWeight="semibold"
            monospacedDigit
            foregroundStyle={i === 1 ? palette.blue : palette.ink}
            lineLimit={1}
            minScaleFactor={0.7}
          >
            {percent(value ?? null)}
          </Text>
        </VStack>
      ))}
    </HStack>
  )
}
function WidgetSpeeds({
  node,
  size = 10,
  vertical = false,
}: {
  node: Node
  size?: number
  vertical?: boolean
}) {
  const down = (
      <Text
        font={size}
        monospacedDigit
        foregroundStyle={palette.blue}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        ↓ {speed(node.status?.down ?? null)}
      </Text>
    ),
    up = (
      <Text
        font={size}
        monospacedDigit
        foregroundStyle={palette.teal}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        ↑ {speed(node.status?.up ?? null)}
      </Text>
    )
  return vertical ? (
    <VStack alignment="leading" spacing={4}>
      {down}
      {up}
    </VStack>
  ) : (
    <HStack spacing={3}>
      {down}
      <Spacer />
      {up}
    </HStack>
  )
}
function WidgetNode({
  node,
  cached,
  family,
  wide = false,
  solo = false,
  availableHeight,
}: {
  node: Node
  cached?: boolean
  family: Family
  wide?: boolean
  solo?: boolean
  availableHeight?: number
}) {
  const large = family === 'systemLarge',
    small = family === 'systemSmall',
    scale = widgetScale(family),
    typeScale =
      scale *
      (!large && availableHeight !== undefined && availableHeight < 100 * scale
        ? 0.88
        : 1),
    size = (solo ? 28 : large ? (wide ? 20 : 17) : 15) * typeScale,
    flow = (solo ? 13 : large ? (wide ? 11 : 10) : 9) * typeScale
  return (
    <VStack
      alignment="leading"
      spacing={solo ? 7 : large ? 2 : 1.5}
      frame={{
        maxWidth: 'infinity',
        maxHeight: 'infinity',
        alignment: 'topLeading',
      }}
    >
      <HStack spacing={4}>
        <Text
          font={(solo ? 22 : wide ? 18 : 16) * typeScale}
          fontWeight="semibold"
          foregroundStyle={palette.ink}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {node.name}
        </Text>
        <Spacer />
        <StatusBadge node={node} cached={cached} compact />
      </HStack>
      {solo ? (
        <Text font={11} foregroundStyle={palette.muted} lineLimit={1}>
          {node.region} / {node.group} · {node.cores ?? '—'} vCPU
        </Text>
      ) : null}
      <WidgetResources
        node={node}
        size={size}
        labelSize={(small || !large ? 8.5 : 9) * typeScale}
      />
      {large ? <Spacer /> : null}
      <TrafficMeter node={node} compact fontSize={flow} />
      <ProbeReading
        node={node}
        compact
        fontSize={(solo ? 13 : wide ? 11 : 9) * typeScale}
      />
      {large ? (
        <Trend
          history={node.history}
          height={solo ? 48 : wide ? 10 : 14}
          muted={cached || state(node) === 'offline'}
        />
      ) : null}
      {small || !large ? <Spacer /> : null}
      <WidgetSpeeds
        node={node}
        size={(solo ? 13 : large ? 11 : 9) * typeScale}
      />
      {solo ? (
        <Text font={11} foregroundStyle={palette.muted}>
          已运行 {uptime(node.status?.uptime ?? null)} · {probe(node).name}
        </Text>
      ) : null}
    </VStack>
  )
}
function MediumSolo({
  node,
  cached,
  availableHeight,
}: {
  node: Node
  cached?: boolean
  availableHeight: number
}) {
  const scale = widgetScale('systemMedium') * (availableHeight < 100 ? 0.88 : 1)
  return (
    <HStack
      spacing={14}
      alignment="top"
      frame={{
        maxWidth: 'infinity',
        maxHeight: 'infinity',
        alignment: 'topLeading',
      }}
    >
      <VStack
        alignment="leading"
        spacing={3}
        frame={{
          maxWidth: 'infinity',
          maxHeight: 'infinity',
          alignment: 'topLeading',
        }}
      >
        <HStack spacing={4}>
          <Text
            font={19 * scale}
            fontWeight="semibold"
            foregroundStyle={palette.ink}
            lineLimit={1}
            minScaleFactor={0.7}
          >
            {node.name}
          </Text>
          <Spacer />
          <StatusBadge node={node} cached={cached} compact />
        </HStack>
        <HStack alignment="firstTextBaseline" spacing={4}>
          <Text
            font={32 * scale}
            fontWeight="semibold"
            monospacedDigit
            foregroundStyle={palette.ink}
          >
            {percent(node.status?.cpu ?? null)}
          </Text>
          <Text font={10} foregroundStyle={palette.muted}>
            CPU
          </Text>
          <Spacer />
        </HStack>
        <Text font={10} foregroundStyle={palette.muted} lineLimit={1}>
          内存 {percent(node.status?.memory ?? null)} · 磁盘{' '}
          {percent(node.status?.disk ?? null)}
        </Text>
        <Text font={9} foregroundStyle={palette.muted} lineLimit={1}>
          运行 {uptime(node.status?.uptime ?? null)}
        </Text>
      </VStack>
      <VStack
        alignment="leading"
        spacing={availableHeight < 100 ? 3 : 4}
        frame={{
          maxWidth: 'infinity',
          maxHeight: 'infinity',
          alignment: 'topLeading',
        }}
      >
        <TrafficMeter node={node} compact fontSize={11 * scale} />
        <ProbeReading node={node} compact fontSize={10 * scale} />
        <Text font={9 * scale} foregroundStyle={palette.muted} lineLimit={1}>
          {probe(node).name}
        </Text>
        <Spacer />
        <WidgetSpeeds node={node} size={11 * scale} vertical />
      </VStack>
    </HStack>
  )
}
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
      .filter((n): n is Node => !!n),
    home = Script.createRunURLScheme(name),
    detail = (id: string) => Script.createRunURLScheme(name, { node: id }),
    usable = nodes.filter(
      (n) => state(n, !!snapshot.cached) === 'online',
    ).length,
    vertical = large ? 12 : 8,
    horizontal = small ? 12 : 14,
    headerHeight = small ? 15 : large ? 20 : 18,
    footerHeight = 11,
    gap = large ? 6 : 3,
    warning =
      snapshot.transport !== 'demo' ? notice || snapshot.notice || '' : '',
    width = Widget.displaySize.width - horizontal * 2,
    bodyHeight = Math.max(
      20,
      Widget.displaySize.height -
        vertical * 2 -
        headerHeight -
        footerHeight -
        gap * 2 -
        (warning ? 11 + gap : 0),
    )
  const title = <SiteBrand snapshot={snapshot} size={small ? 10.5 : 11} />,
    nodeLink = (node: Node, wide = false, solo = false) => (
      <Link
        key={node.id}
        url={detail(node.id)}
        frame={{
          maxWidth: 'infinity',
          maxHeight: 'infinity',
          alignment: 'topLeading',
        }}
      >
        <WidgetNode
          node={node}
          cached={snapshot.cached}
          family={family}
          wide={wide}
          solo={solo}
          availableHeight={bodyHeight}
        />
      </Link>
    )
  return (
    <VStack
      alignment="leading"
      spacing={0}
      frame={Widget.displaySize}
      widgetBackground={palette.gradient}
      widgetURL={small ? home : undefined}
    >
      <VStack
        alignment="leading"
        spacing={gap}
        padding={{ horizontal, vertical }}
        frame={{
          maxWidth: 'infinity',
          maxHeight: 'infinity',
          alignment: 'topLeading',
        }}
      >
        <HStack
          spacing={8}
          frame={{ width, height: headerHeight, alignment: 'leading' }}
        >
          {small ? (
            title
          ) : (
            <Link
              url={home}
              frame={{ maxWidth: 'infinity', alignment: 'leading' }}
            >
              {title}
            </Link>
          )}
          {!small ? (
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
                frame={{ width: 18, height: 18 }}
              />
            </Button>
          ) : null}
        </HStack>
        <VStack
          alignment="leading"
          spacing={0}
          frame={{ width, height: bodyHeight, alignment: 'topLeading' }}
        >
          {!nodes.length ? (
            <VStack alignment="leading" spacing={8}>
              <Text
                font={17}
                fontWeight="semibold"
                foregroundStyle={palette.ink}
              >
                连接你的云端
              </Text>
              <Text font={11} foregroundStyle={palette.muted}>
                {warning || '打开脚本，在设置里选择 VPS。'}
              </Text>
            </VStack>
          ) : small ? (
            <WidgetNode
              node={nodes[0]}
              cached={snapshot.cached}
              family={family}
              availableHeight={bodyHeight}
            />
          ) : !large ? (
            nodes.length === 1 ? (
              <Link
                url={detail(nodes[0].id)}
                frame={{
                  maxWidth: 'infinity',
                  maxHeight: 'infinity',
                  alignment: 'topLeading',
                }}
              >
                <MediumSolo
                  node={nodes[0]}
                  cached={snapshot.cached}
                  availableHeight={bodyHeight}
                />
              </Link>
            ) : (
              <HStack
                alignment="top"
                spacing={12}
                frame={{
                  maxWidth: 'infinity',
                  maxHeight: 'infinity',
                  alignment: 'topLeading',
                }}
              >
                {nodes.map((n) => nodeLink(n))}
              </HStack>
            )
          ) : nodes.length === 1 ? (
            nodeLink(nodes[0], true, true)
          ) : nodes.length === 2 ? (
            <VStack
              alignment="leading"
              spacing={8}
              frame={{
                maxWidth: 'infinity',
                maxHeight: 'infinity',
                alignment: 'topLeading',
              }}
            >
              {nodes.map((n) => nodeLink(n, true))}
            </VStack>
          ) : (
            <VStack
              alignment="leading"
              spacing={8}
              frame={{
                maxWidth: 'infinity',
                maxHeight: 'infinity',
                alignment: 'topLeading',
              }}
            >
              {[nodes.slice(0, 2), nodes.slice(2, 4)].map((row, i) => (
                <HStack
                  key={String(i)}
                  alignment="top"
                  spacing={12}
                  frame={{
                    maxWidth: 'infinity',
                    maxHeight: 'infinity',
                    alignment: 'topLeading',
                  }}
                >
                  {row.map((n) => nodeLink(n, row.length === 1))}
                </HStack>
              ))}
            </VStack>
          )}
        </VStack>
        {warning ? (
          <Text
            font={8.5}
            foregroundStyle={palette.muted}
            lineLimit={1}
            minScaleFactor={0.7}
          >
            {warning}
          </Text>
        ) : null}
        <HStack
          spacing={4}
          frame={{ width, height: footerHeight, alignment: 'leading' }}
        >
          <UpdateNote
            time={snapshot.fetchedAt}
            cached={snapshot.cached}
            demo={snapshot.transport === 'demo'}
          />
          <Spacer />
          {large ? (
            <Text font={9} foregroundStyle={palette.muted}>
              {snapshot.cached ? '—' : usable}/{nodes.length} 在线
            </Text>
          ) : null}
          {!small ? (
            <Link
              url={home}
              frame={{ width: 66, height: footerHeight, alignment: 'trailing' }}
            >
              <Text font={9} foregroundStyle={palette.teal} lineLimit={1}>
                全部 {snapshot.nodes.length} 台 ›
              </Text>
            </Link>
          ) : null}
        </HStack>
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
