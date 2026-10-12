import { VStack, HStack, Text, Image, SVG, Spacer, useState } from 'scripting'
import { readRates, displayCategory } from './display-data'
import { cnyLabel } from './presentation'
import { readLogo, logoBackground } from './icons'
import { readConfig, loadLogos } from './state'
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
  wash: { light: '#EEF1F8', dark: '#293147' },
  card: { light: '#FFFFFF', dark: '#1A2035' },
  gradient: {
    light: {
      gradient: [
        { color: '#FFFFFF', location: 0 },
        { color: '#EEF1F9', location: 1 },
      ],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    dark: {
      gradient: [
        { color: '#222A3E', location: 0 },
        { color: '#171D2E', location: 1 },
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
export function SubscriptionIcon({
  s,
  size = 36,
}: {
  s: Subscription
  size?: number
}) {
  const [, setVersion] = useState(0)
  const config = readConfig(),
    logo = readLogo(config, s)
  async function appear() {
    if (!s.logo || config.mode === 'demo') return
    await loadLogos(config, [s])
    if (readConfig().revision === config.revision) setVersion((v) => v + 1)
  }
  return <IconContent s={s} size={size} logo={logo} onAppear={appear} />
}
export function WidgetIcon({
  s,
  size = 36,
}: {
  s: Subscription
  size?: number
}) {
  return (
    <IconContent s={s} size={size} logo={readLogo(readConfig(), s, true)} />
  )
}
function IconContent({
  s,
  size,
  logo,
  onAppear,
}: {
  s: Subscription
  size: number
  logo: ReturnType<typeof readLogo>
  onAppear?: () => Promise<void>
}) {
  if (logo)
    return (
      <VStack
        onAppear={onAppear}
        frame={{ width: size, height: size }}
        background={logoBackground(logo)}
        clipShape={{ type: 'rect', cornerRadius: size * 0.25 }}
      >
        {'svg' in logo ? (
          <SVG
            code={logo.svg}
            resizable
            renderingMode="original"
            scaleToFit
            frame={{ width: size - 6, height: size - 6 }}
          />
        ) : (
          <Image
            image={logo.image}
            resizable
            renderingMode="original"
            scaleToFit
            frame={{ width: size - 6, height: size - 6 }}
          />
        )}
      </VStack>
    )
  return (
    <Text
      onAppear={onAppear}
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
export function SubscriptionPrice({
  s,
  font = 14,
  compact = false,
  alignment = 'leading',
  inline = false,
}: {
  s: Subscription
  font?: number
  compact?: boolean
  alignment?: 'leading' | 'trailing'
  inline?: boolean
}) {
  const converted = cnyLabel(s, readRates(readConfig()))
  const price = (
    <Text
      font={font}
      fontWeight="medium"
      foregroundStyle={palette.ink}
      monospacedDigit
      lineLimit={1}
      minScaleFactor={0.65}
    >
      {priceLabel(s)}
    </Text>
  )
  const reference = converted ? (
    <Text
      font={compact ? 9 : 10}
      foregroundStyle={palette.muted}
      monospacedDigit
      lineLimit={1}
      minScaleFactor={0.65}
    >
      {converted}
    </Text>
  ) : null
  return inline ? (
    <HStack
      spacing={4}
      frame={{ maxWidth: 'infinity', alignment: 'leading' }}
      alignment="firstTextBaseline"
    >
      {price}
      {reference ? <Spacer /> : null}
      {reference}
    </HStack>
  ) : (
    <VStack alignment={alignment} spacing={compact ? 2 : 3}>
      {price}
      {reference}
    </VStack>
  )
}
export function SubscriptionRow({
  s,
  date,
  dense = false,
  widget = false,
  iconSize,
}: {
  s: Subscription
  date: string
  dense?: boolean
  widget?: boolean
  iconSize?: number
}) {
  const d = dueFor(s, date)
  return (
    <HStack
      spacing={dense ? 9 : 12}
      padding={{ vertical: dense ? 0 : 8 }}
      frame={{ maxWidth: 'infinity', alignment: 'leading' }}
    >
      {widget ? (
        <WidgetIcon s={s} size={iconSize || 28} />
      ) : (
        <SubscriptionIcon s={s} size={dense ? 28 : 42} />
      )}
      <VStack
        alignment="leading"
        spacing={dense ? 3 : 5}
        frame={{ maxWidth: 'infinity', alignment: 'leading' }}
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
        <HStack spacing={4} alignment="firstTextBaseline">
          <Text
            font={dense ? 9 : 11}
            foregroundStyle={palette.muted}
            lineLimit={1}
          >
            {dense
              ? d
                ? `${d.date.slice(5).replace('-', '/')} · ${dueTypes[d.type]}`
                : cycleLabel(s)
              : `${displayCategory(readConfig(), s.category)} · ${cycleLabel(s)}${s.autoRenew ? ' · 自动续订' : ''}`}
          </Text>
          {dense ? (
            <Text font={9} foregroundStyle={tone(d)} lineLimit={1}>
              {dueLabel(d)}
            </Text>
          ) : null}
        </HStack>
      </VStack>
      <VStack alignment="trailing" spacing={4}>
        <SubscriptionPrice
          s={s}
          font={dense ? 11 : 14}
          compact={dense}
          alignment="trailing"
        />
        {!dense ? (
          <Text font={11} foregroundStyle={tone(d)} lineLimit={1}>
            {dueLabel(d)}
          </Text>
        ) : null}
      </VStack>
    </HStack>
  )
}
export function Metric({ title, value }: { title: string; value: string }) {
  return (
    <VStack
      alignment="leading"
      spacing={5}
      frame={{ maxWidth: 'infinity', alignment: 'leading' }}
    >
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
    <VStack alignment="leading" spacing={16} padding={{ vertical: 6 }}>
      <HStack>
        <Image
          systemName="calendar.badge.clock"
          foregroundStyle={palette.accent}
        />
        <Text font={11} fontWeight="semibold" foregroundStyle={palette.accent}>
          订阅概览
        </Text>
        <Spacer />
      </HStack>
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
          未来 7 天 · 标价合计
        </Text>
        <Text font={16} fontWeight="semibold" foregroundStyle={palette.accent}>
          {sums.length ? sums.join('  ·  ') : '暂无即将到期的账单'}
        </Text>
        <Text font={10} foregroundStyle={palette.muted}>
          分币种 · 分摊前 · 含试用与权益期参考价
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
