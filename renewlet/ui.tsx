import { VStack, HStack, Text, Image, Spacer, ProgressView } from 'scripting'
import {
  dueFor,
  dueLabel,
  dueTypes,
  cycleLabel,
  priceLabel,
  upcoming,
  totals,
  type Subscription,
  type Snapshot,
  type Config,
  type Due,
} from './model'
export const palette = {
  ink: { light: '#20243B', dark: '#EEF0FF' },
  muted: { light: '#69708B', dark: '#A0A8C6' },
  accent: { light: '#5268DA', dark: '#A8B6FF' },
  green: { light: '#237764', dark: '#84D7B9' },
  amber: { light: '#A76219', dark: '#F1BC78' },
  red: { light: '#BE465F', dark: '#FF9BAF' },
  wash: { light: '#EDF0FE', dark: '#242D49' },
  card: { light: '#FFFFFF', dark: '#1A2035' },
  gradient: {
    light: {
      gradient: [
        { color: '#F7F8FF', location: 0 },
        { color: '#E8EEFC', location: 1 },
      ],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    dark: {
      gradient: [
        { color: '#252F50', location: 0 },
        { color: '#141A2D', location: 1 },
      ],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
  },
} as const
export function tone(d: Due | null) {
  return d && d.days < 0
    ? palette.red
    : d && d.days <= 3
      ? palette.amber
      : palette.accent
}
export function Monogram({ s, size = 36 }: { s: Subscription; size?: number }) {
  return (
    <Text
      font={size * 0.44}
      fontWeight="semibold"
      foregroundStyle={palette.accent}
      frame={{ width: size, height: size }}
      background={palette.wash}
      clipShape={{ type: 'rect', cornerRadius: size * 0.28 }}
    >
      {Array.from(s.name)[0]?.toUpperCase() || 'R'}
    </Text>
  )
}
export function Note({
  snapshot,
  demo = false,
}: {
  snapshot: Snapshot
  demo?: boolean
}) {
  const time = snapshot.fetchedAt
    ? new Date(snapshot.fetchedAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '未同步'
  return (
    <Text
      font={10}
      foregroundStyle={palette.muted}
      lineLimit={1}
      minScaleFactor={0.7}
    >
      {demo ? '演示 · ' : snapshot.cached ? '旧快照 · ' : ''}
      {time}
    </Text>
  )
}
export function SubscriptionRow({
  s,
  date,
  dense = false,
}: {
  s: Subscription
  date: string
  dense?: boolean
}) {
  const d = dueFor(s, date)
  return (
    <HStack
      spacing={dense ? 9 : 12}
      padding={{ vertical: dense ? 2 : 8 }}
      frame={{ maxWidth: 'infinity' }}
    >
      <Monogram s={s} size={dense ? 28 : 42} />
      <VStack
        alignment="leading"
        spacing={dense ? 3 : 5}
        frame={{ maxWidth: 'infinity' }}
      >
        <Text
          font={dense ? 12 : 16}
          fontWeight="semibold"
          foregroundStyle={palette.ink}
          lineLimit={1}
          minScaleFactor={0.75}
        >
          {s.pinned ? '· ' : ''}
          {s.name}
        </Text>
        <Text
          font={dense ? 9 : 11}
          foregroundStyle={palette.muted}
          lineLimit={1}
        >
          {dense
            ? `${d?.date.slice(5).replace('-', '/')} · ${d ? dueTypes[d.type] : ''}`
            : `${s.category} · ${cycleLabel(s)}${s.autoRenew ? ' · 自动续订' : ''}`}
        </Text>
      </VStack>
      <VStack alignment="trailing" spacing={4}>
        <Text
          font={dense ? 11 : 14}
          fontWeight="medium"
          foregroundStyle={palette.ink}
          monospacedDigit
          lineLimit={1}
          minScaleFactor={0.65}
        >
          {priceLabel(s)}
        </Text>
        <Text font={dense ? 10 : 11} foregroundStyle={tone(d)} lineLimit={1}>
          {dueLabel(d)}
        </Text>
      </VStack>
    </HStack>
  )
}
export function Metric({ title, value }: { title: string; value: string }) {
  return (
    <VStack alignment="leading" spacing={5} frame={{ maxWidth: 'infinity' }}>
      <Text
        font={27}
        fontWeight="semibold"
        foregroundStyle={palette.ink}
        monospacedDigit
      >
        {value}
      </Text>
      <Text font={11} foregroundStyle={palette.muted}>
        {title}
      </Text>
    </VStack>
  )
}
export function Overview({
  snapshot,
  config,
  date,
}: {
  snapshot: Snapshot
  config: Config
  date: string
}) {
  const next = upcoming(snapshot.subscriptions, date, 7),
    overdue = snapshot.subscriptions.filter(
      (s) => (dueFor(s, date)?.days ?? 0) < 0,
    ),
    sums = totals(next)
  return (
    <VStack alignment="leading" spacing={18} padding={{ vertical: 12 }}>
      <HStack>
        <Image
          systemName="calendar.badge.clock"
          foregroundStyle={palette.accent}
        />
        <Text font={11} fontWeight="semibold" foregroundStyle={palette.accent}>
          RENEWLET / 续订手札
        </Text>
        <Spacer />
      </HStack>
      <Text font={28} fontWeight="semibold" foregroundStyle={palette.ink}>
        {overdue.length ? '有几笔账单，等你照看。' : '把下次，安排得从容。'}
      </Text>
      <HStack spacing={20}>
        <Metric
          title="全部订阅"
          value={String(snapshot.subscriptions.length)}
        />
        <Metric title="未来 7 天" value={String(next.length)} />
        <Metric title="逾期待确认" value={String(overdue.length)} />
      </HStack>
      <VStack
        alignment="leading"
        spacing={5}
        padding={12}
        frame={{ maxWidth: 'infinity', alignment: 'leading' }}
        background={palette.wash}
        clipShape={{ type: 'rect', cornerRadius: 14 }}
      >
        <Text font={10} fontWeight="medium" foregroundStyle={palette.muted}>
          未来 7 天 · 每笔下一次标价 / 试用与权益期参考
        </Text>
        <Text font={16} fontWeight="semibold" foregroundStyle={palette.accent}>
          {sums.length ? sums.join('  ·  ') : '暂无即将到期的账单'}
        </Text>
        <Text font={10} foregroundStyle={palette.muted}>
          按币种分别汇总 · 非支付确认 · 家庭分摊前
        </Text>
      </VStack>
      <Note snapshot={snapshot} demo={config.mode === 'demo'} />
      {snapshot.notice ? (
        <Text font={12} foregroundStyle={palette.muted}>
          {snapshot.notice}
        </Text>
      ) : null}
    </VStack>
  )
}
export function Countdown({
  d,
  compact = false,
  fontSize,
}: {
  d: Due
  compact?: boolean
  fontSize?: number
}) {
  return (
    <VStack alignment="leading" spacing={compact ? 1 : 4}>
      <HStack alignment="firstTextBaseline" spacing={4}>
        <Text
          font={fontSize || (compact ? 38 : 46)}
          fontWeight="semibold"
          foregroundStyle={tone(d)}
          monospacedDigit
        >
          {d.days}
        </Text>
        <Text font={11} foregroundStyle={palette.muted}>
          天{d.days === 0 ? ' · 今天' : ''}
        </Text>
      </HStack>
      <Text font={10} foregroundStyle={palette.muted}>
        {d.date.slice(5).replace('-', '/')} · {dueTypes[d.type]}
      </Text>
      <ProgressView
        value={Math.max(0, Math.min(1, 1 - d.days / 30))}
        total={1}
        progressViewStyle="linear"
        tint={tone(d)}
      />
    </VStack>
  )
}
