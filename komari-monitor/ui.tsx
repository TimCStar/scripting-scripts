import {
  VStack,
  HStack,
  Text,
  Image,
  Spacer,
  ProgressView,
  Chart,
  LineChart,
} from 'scripting'
import {
  state,
  stateLabel,
  percent,
  speed,
  timeLabel,
  type Node,
  type Sample,
} from './model'
export const palette = {
  ink: { light: '#172E32', dark: '#E7F4F0' },
  muted: { light: '#647A7D', dark: '#94ABA9' },
  teal: { light: '#087F78', dark: '#5CDEC5' },
  blue: { light: '#347EC3', dark: '#82B9F0' },
  amber: { light: '#AB651A', dark: '#F3BC70' },
  red: { light: '#BC4555', dark: '#F68D9B' },
  canvas: { light: '#F1F6F4', dark: '#0C161B' },
  card: { light: '#FFFFFF', dark: '#17252B' },
  line: { light: '#DDE9E5', dark: '#2B3F44' },
  wash: { light: '#E7F4EF', dark: '#203B3A' },
  gradient: {
    light: {
      gradient: [
        { color: '#F3FAF5', location: 0 },
        { color: '#E6F0F4', location: 1 },
      ],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    dark: {
      gradient: [
        { color: '#162B2D', location: 0 },
        { color: '#0D1924', location: 1 },
      ],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
  },
} as const
export function StatusBadge({
  node,
  cached = false,
  compact = false,
}: {
  node: Node
  cached?: boolean
  compact?: boolean
}) {
  const s = state(node, cached),
    color =
      s === 'online' || s === 'recent'
        ? palette.teal
        : s === 'offline'
          ? palette.red
          : palette.muted
  return (
    <HStack spacing={4}>
      <Image systemName="circle.fill" font={6} foregroundStyle={color} />
      <Text font={compact ? 9 : 11} foregroundStyle={color} lineLimit={1}>
        {cached ? '旧快照' : stateLabel[s]}
      </Text>
    </HStack>
  )
}
export function Resource({
  label,
  value,
  detail,
  large = false,
  color = palette.teal,
}: {
  label: string
  value: number | null
  detail?: string
  large?: boolean
  color?: typeof palette.teal | typeof palette.blue
}) {
  return (
    <VStack
      alignment="leading"
      spacing={large ? 7 : 3}
      frame={{ maxWidth: 'infinity' }}
    >
      {large ? (
        <HStack alignment="firstTextBaseline" spacing={4}>
          <Text font={12} foregroundStyle={palette.muted}>
            {label}
          </Text>
          <Spacer />
          <Text
            font={24}
            fontWeight="semibold"
            monospacedDigit
            foregroundStyle={palette.ink}
          >
            {percent(value)}
          </Text>
        </HStack>
      ) : (
        <VStack alignment="leading" spacing={2}>
          <Text font={9} foregroundStyle={palette.muted}>
            {label}
          </Text>
          <Text
            font={16}
            fontWeight="semibold"
            monospacedDigit
            foregroundStyle={palette.ink}
            lineLimit={1}
            minScaleFactor={0.7}
          >
            {percent(value)}
          </Text>
        </VStack>
      )}
      {value === null ? (
        <Text font={9} foregroundStyle={palette.muted}>
          暂无读数
        </Text>
      ) : (
        <ProgressView
          value={Math.min(100, value)}
          total={100}
          progressViewStyle="linear"
          tint={value >= 90 ? palette.amber : color}
        />
      )}
      {detail ? (
        <Text
          font={10}
          foregroundStyle={palette.muted}
          monospacedDigit
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {detail}
        </Text>
      ) : null}
    </VStack>
  )
}
export function Resources({
  node,
  large = false,
}: {
  node: Node
  large?: boolean
}) {
  const s = node.status
  return (
    <HStack spacing={large ? 16 : 10}>
      <Resource label="CPU" value={s?.cpu ?? null} large={large} />
      <Resource
        label="内存"
        value={s?.memory ?? null}
        large={large}
        color={palette.blue}
      />
      <Resource label="磁盘" value={s?.disk ?? null} large={large} />
    </HStack>
  )
}
export function Trend({
  history,
  metric = 'cpu',
  height = 32,
  muted = false,
}: {
  history: Sample[]
  metric?: 'cpu' | 'memory' | 'disk'
  height?: number
  muted?: boolean
}) {
  // Preserve true timestamps; missing readings split the chart into separate segments.
  const segments: Sample[][] = []
  for (const s of history) {
    if (s[metric] === null) {
      if (segments.at(-1)?.length) segments.push([])
    } else {
      if (!segments.length) segments.push([])
      segments.at(-1)!.push(s)
    }
  }
  const lines = segments.filter((s) => s.length >= 2)
  if (!lines.length)
    return (
      <Text font={10} foregroundStyle={palette.muted} frame={{ height }}>
        趋势暂无数据
      </Text>
    )
  return (
    <Chart
      chartXAxis="hidden"
      chartYAxis="hidden"
      chartLegend="hidden"
      chartYScale={{
        domain: {
          from: 0,
          to: Math.max(100, ...history.map((s) => s[metric] ?? 0)),
        },
        type: 'linear',
      }}
      frame={{ height }}
    >
      {lines.map((segment, i) => (
        <LineChart
          key={String(i)}
          marks={segment.map((s) => ({
            label: new Date(s.time),
            value: s[metric]!,
            foregroundStyle: muted
              ? palette.muted
              : metric === 'memory'
                ? palette.blue
                : palette.teal,
          }))}
        />
      ))}
    </Chart>
  )
}
export function NodeCard({
  node,
  cached = false,
  dense = false,
  trend = true,
}: {
  node: Node
  cached?: boolean
  dense?: boolean
  trend?: boolean
}) {
  const s = node.status
  return (
    <VStack
      alignment="leading"
      spacing={dense ? 4 : 10}
      frame={{ maxWidth: 'infinity' }}
    >
      <HStack spacing={6}>
        <Text
          font={dense ? 13 : 17}
          fontWeight="semibold"
          foregroundStyle={palette.ink}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {node.name}
        </Text>
        <Spacer />
        {!dense ? <StatusBadge node={node} cached={cached} /> : null}
      </HStack>
      {dense ? (
        <HStack spacing={4}>
          <Text font={9} foregroundStyle={palette.muted}>
            {node.region}
          </Text>
          <Spacer />
          <StatusBadge node={node} cached={cached} compact />
        </HStack>
      ) : null}
      {!dense ? (
        <Text
          font={11}
          foregroundStyle={palette.muted}
          lineLimit={1}
        >{`${node.region} / ${node.group} · ${node.cores ?? '—'} vCPU`}</Text>
      ) : null}
      <Resources node={node} />
      {trend ? (
        <Trend
          history={node.history}
          height={dense ? 16 : 36}
          muted={cached || state(node) === 'offline'}
        />
      ) : null}
      <HStack spacing={5}>
        <Image
          systemName="arrow.down"
          font={9}
          foregroundStyle={palette.blue}
        />
        <Text
          font={dense ? 9 : 11}
          monospacedDigit
          foregroundStyle={palette.ink}
          lineLimit={1}
          minScaleFactor={0.65}
        >
          {speed(s?.down ?? null)}
        </Text>
        <Spacer />
        <Image systemName="arrow.up" font={9} foregroundStyle={palette.teal} />
        <Text
          font={dense ? 9 : 11}
          monospacedDigit
          foregroundStyle={palette.ink}
          lineLimit={1}
          minScaleFactor={0.65}
        >
          {speed(s?.up ?? null)}
        </Text>
      </HStack>
    </VStack>
  )
}
export function Reading({
  title,
  value,
  accent = false,
}: {
  title: string
  value: string
  accent?: boolean
}) {
  return (
    <VStack alignment="leading" spacing={5} frame={{ maxWidth: 'infinity' }}>
      <Text font={11} foregroundStyle={palette.muted}>
        {title}
      </Text>
      <Text
        font={24}
        fontWeight="semibold"
        monospacedDigit
        foregroundStyle={accent ? palette.teal : palette.ink}
        lineLimit={1}
        minScaleFactor={0.65}
      >
        {value}
      </Text>
    </VStack>
  )
}
export function UpdateNote({
  time,
  cached = false,
  demo = false,
}: {
  time: string
  cached?: boolean
  demo?: boolean
}) {
  return (
    <Text
      font={9}
      foregroundStyle={palette.muted}
      monospacedDigit
      lineLimit={1}
    >{`${demo ? '演示 · ' : cached ? '旧快照 · ' : ''}${timeLabel(time)} · 采样`}</Text>
  )
}
