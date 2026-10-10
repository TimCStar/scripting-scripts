import {
  VStack,
  HStack,
  Text,
  Image,
  Spacer,
  ProgressView,
  Chart,
  LineChart,
  Button,
} from 'scripting'
import {
  state,
  percent,
  speed,
  timeLabel,
  traffic,
  bytes,
  ratio,
  probe,
  latency,
  lossLabel,
  type Snapshot,
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
export function SiteBrand({
  snapshot,
  size = 12,
}: {
  snapshot: Snapshot
  size?: number
}) {
  const icon = snapshot.site?.icon
    ? UIImage.fromBase64String(snapshot.site.icon)
    : null
  return (
    <HStack spacing={6} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      {icon ? (
        <Image
          image={icon}
          resizable
          scaleToFit
          frame={{ width: size + 4, height: size + 4 }}
        />
      ) : (
        <Image
          systemName="waveform.path"
          font={size + 2}
          foregroundStyle={palette.teal}
        />
      )}
      <Text
        font={size}
        fontWeight="semibold"
        foregroundStyle={palette.ink}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {snapshot.site?.title || 'Komari 夜航'}
      </Text>
    </HStack>
  )
}
export function ConnectionIssue({
  message,
  busy,
  retry,
}: {
  message: string
  busy: boolean
  retry: () => Promise<void>
}) {
  return (
    <VStack
      alignment="leading"
      spacing={7}
      frame={{ maxWidth: 'infinity', alignment: 'leading' }}
    >
      <Text font={13} foregroundStyle={palette.red}>
        {message}
      </Text>
      <Button title={busy ? '重试中…' : '立即重试'} action={retry} />
    </VStack>
  )
}
export function TrafficMeter({
  node,
  compact = false,
  fontSize,
}: {
  node: Node
  compact?: boolean
  fontSize?: number
}) {
  const amount = traffic(node),
    limit =
      node.trafficLimit && node.trafficLimit > 0 ? node.trafficLimit : null,
    value = ratio(amount, limit)
  const font = fontSize ?? (compact ? 9 : 12)
  return (
    <VStack
      alignment="leading"
      spacing={compact ? 2 : 5}
      frame={{ maxWidth: 'infinity', alignment: 'leading' }}
    >
      <HStack spacing={4}>
        <Text font={font} foregroundStyle={palette.muted}>
          流量
        </Text>
        <Spacer />
        <Text
          font={font}
          monospacedDigit
          foregroundStyle={
            value !== null && value >= 90 ? palette.amber : palette.ink
          }
          lineLimit={1}
        >
          {limit === null
            ? '0.0%'
            : value === null
              ? '—'
              : `${value.toFixed(1)}%`}
        </Text>
      </HStack>
      <ProgressView
        value={value === null ? 0 : Math.min(value, 100)}
        total={100}
        progressViewStyle="linear"
        tint={value !== null && value >= 90 ? palette.amber : palette.teal}
      />
      <Text
        font={font}
        monospacedDigit
        foregroundStyle={palette.muted}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {bytes(amount)} / {limit === null ? '∞' : bytes(limit)}
      </Text>
      {!compact ? (
        <Text font={10} foregroundStyle={palette.muted} lineLimit={1}>
          {limit
            ? `${node.trafficType} 计量 · 余量 ${bytes(amount === null ? null : Math.max(0, limit - amount))}`
            : '累计上报流量 · 无额度限制'}
        </Text>
      ) : null}
    </VStack>
  )
}

export function ProbeReading({
  node,
  compact = false,
  fontSize,
}: {
  node: Node
  compact?: boolean
  fontSize?: number
}) {
  const p = probe(node)
  return (
    <VStack
      alignment="leading"
      spacing={compact ? 0 : 5}
      frame={{ maxWidth: 'infinity' }}
    >
      {!compact ? (
        <Text font={10} foregroundStyle={palette.muted} lineLimit={1}>
          {p.name} · 一小时汇总
        </Text>
      ) : null}
      <HStack spacing={4}>
        <Text
          font={fontSize ?? (compact ? 9 : 12)}
          monospacedDigit
          foregroundStyle={palette.blue}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          延迟 {latency(p.latest)}
        </Text>
        <Spacer />
        <Text
          font={fontSize ?? (compact ? 9 : 12)}
          monospacedDigit
          foregroundStyle={(p.loss ?? 0) > 0 ? palette.amber : palette.teal}
          lineLimit={1}
        >
          丢包 {lossLabel(p.loss)}
        </Text>
      </HStack>
    </VStack>
  )
}
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
      s === 'online'
        ? palette.teal
        : s === 'offline'
          ? palette.red
          : s === 'stale' || s === 'recent'
            ? palette.amber
            : palette.muted
  return (
    <HStack spacing={0} frame={{ width: compact ? 8 : 10 }}>
      <Image
        systemName="circle.fill"
        font={compact ? 6 : 8}
        foregroundStyle={color}
      />
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
  ceiling = 100,
}: {
  history: Sample[]
  metric?: 'cpu' | 'memory' | 'disk' | 'up' | 'down'
  height?: number
  muted?: boolean
  ceiling?: number
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
          to: Math.max(ceiling, ...history.map((s) => s[metric] ?? 0)),
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
      spacing={dense ? 4 : 8}
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
        <StatusBadge node={node} cached={cached} compact={dense} />
      </HStack>
      {!dense ? (
        <Text
          font={11}
          foregroundStyle={palette.muted}
          lineLimit={1}
        >{`${node.region} / ${node.group} · ${node.cores ?? '—'} vCPU`}</Text>
      ) : null}
      {dense ? (
        <Text
          font={9}
          foregroundStyle={palette.muted}
          lineLimit={1}
          minScaleFactor={0.75}
        >
          CPU {percent(s?.cpu ?? null)} · 内存 {percent(s?.memory ?? null)} ·
          磁盘 {percent(s?.disk ?? null)}
        </Text>
      ) : (
        <Resources node={node} />
      )}
      <VStack
        alignment="leading"
        spacing={dense ? 4 : 8}
        frame={{ maxWidth: 'infinity', alignment: 'leading' }}
      >
        <TrafficMeter node={node} compact={dense} />
        <ProbeReading node={node} compact={dense} />
      </VStack>
      {trend ? (
        <Trend
          history={node.history}
          height={dense ? 16 : 24}
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
