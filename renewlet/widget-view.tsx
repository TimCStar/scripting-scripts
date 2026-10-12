import { VStack, HStack, Text, Image, Spacer, Link, Script } from 'scripting'
import {
  upcoming,
  dueFor,
  dueTypes,
  totals,
  cycleLabel,
  type Snapshot,
  type Config,
  type Family,
} from './model'
import {
  palette,
  SubscriptionRow,
  WidgetIcon,
  SubscriptionPrice,
  Note,
  tone,
} from './ui'

export function widgetLimit(family: Family, height: number) {
  return family === 'systemSmall'
    ? 1
    : family === 'systemLarge'
      ? height >= 370
        ? 6
        : 5
      : 3
}
export function WidgetView({
  snapshot,
  config,
  family,
  date,
  width,
  height,
}: {
  snapshot: Snapshot
  config: Config
  family: Family
  date: string
  width: number
  height: number
}) {
  const small = family === 'systemSmall',
    large = family === 'systemLarge'
  const all = upcoming(snapshot.subscriptions, date, config.days)
  const rows = all.slice(0, widgetLimit(family, height)),
    next = rows[0]
  const mediumRowHeight = Math.max(
    28,
    Math.floor(
      (height - 56 - 4 * (rows.length - 1)) / Math.max(1, rows.length),
    ),
  )
  const home = Script.createRunURLScheme(Script.name)
  const overdue = snapshot.subscriptions.filter(
    (s) => (dueFor(s, date)?.days ?? 0) < 0,
  ).length
  return (
    <VStack
      frame={{ width, height }}
      widgetBackground={palette.gradient}
      widgetURL={small ? home : undefined}
    >
      <VStack
        alignment="leading"
        spacing={small ? 6 : 5}
        padding={{ horizontal: small ? 12 : 14, vertical: large ? 12 : 10 }}
        frame={{
          maxWidth: 'infinity',
          maxHeight: 'infinity',
          alignment: 'topLeading',
        }}
      >
        {!small ? (
          <Link
            url={home}
            frame={{ maxWidth: 'infinity', alignment: 'leading' }}
          >
            <HStack>
              <Text
                font={large ? 14 : 10}
                fontWeight="semibold"
                foregroundStyle={palette.ink}
              >
                即将到期
              </Text>
              <Spacer />
              <Text font={10} foregroundStyle={palette.muted}>
                {config.days} 天内 · {all.length} 笔
              </Text>
            </HStack>
          </Link>
        ) : null}
        {!next ? (
          <VStack
            spacing={8}
            frame={{
              maxWidth: 'infinity',
              maxHeight: 'infinity',
              alignment: 'topLeading',
            }}
          >
            <Spacer />
            <Image
              systemName={snapshot.cached ? 'wifi.exclamationmark' : 'calendar'}
              font={24}
              foregroundStyle={palette.accent}
            />
            <Text
              font={small ? 14 : 16}
              fontWeight="semibold"
              foregroundStyle={palette.ink}
            >
              {snapshot.cached ? '同步未完成' : '暂无即将到期订阅'}
            </Text>
            <Text font={10} foregroundStyle={palette.muted} lineLimit={2}>
              {snapshot.notice || `未来 ${config.days} 天内无到期项目`}
            </Text>
            <Spacer />
          </VStack>
        ) : small ? (
          <VStack
            alignment="leading"
            spacing={3}
            frame={{
              maxWidth: 'infinity',
              maxHeight: 'infinity',
              alignment: 'topLeading',
            }}
          >
            <HStack spacing={7}>
              <WidgetIcon s={next.subscription} size={36} />
              <VStack
                alignment="leading"
                spacing={3}
                frame={{ maxWidth: 'infinity', alignment: 'leading' }}
              >
                <Text
                  font={15}
                  fontWeight="semibold"
                  foregroundStyle={palette.ink}
                  lineLimit={1}
                  minScaleFactor={0.75}
                >
                  {next.subscription.name}
                </Text>
                <Text font={10} foregroundStyle={palette.muted} lineLimit={1}>
                  {cycleLabel(next.subscription)}
                </Text>
              </VStack>
            </HStack>
            <Spacer />
            <HStack alignment="firstTextBaseline" spacing={3}>
              <Text
                font={36}
                fontWeight="semibold"
                foregroundStyle={tone(next)}
                monospacedDigit
              >
                {next.days}
              </Text>
              <Text font={10} foregroundStyle={palette.muted}>
                天
              </Text>
              <Spacer />
              <VStack alignment="trailing" spacing={4}>
                <Text
                  font={12}
                  fontWeight="medium"
                  foregroundStyle={palette.ink}
                  monospacedDigit
                >
                  {next.date.slice(5).replace('-', '/')}
                </Text>
                <Text font={9} foregroundStyle={palette.muted}>
                  {dueTypes[next.type]}
                </Text>
              </VStack>
            </HStack>
            <SubscriptionPrice s={next.subscription} font={13} compact inline />
          </VStack>
        ) : (
          <VStack
            alignment="leading"
            spacing={large ? 6 : 4}
            frame={{
              maxWidth: 'infinity',
              maxHeight: 'infinity',
              alignment: 'topLeading',
            }}
          >
            {large ? (
              <HStack
                padding={8}
                background={palette.wash}
                clipShape={{ type: 'rect', cornerRadius: 12 }}
              >
                <VStack alignment="leading" spacing={4}>
                  <Text font={9} foregroundStyle={palette.muted}>
                    未来 7 天 · 标价合计（分摊前）
                  </Text>
                  <Text
                    font={15}
                    fontWeight="semibold"
                    foregroundStyle={palette.ink}
                    lineLimit={1}
                    minScaleFactor={0.65}
                    monospacedDigit
                  >
                    {totals(upcoming(snapshot.subscriptions, date, 7)).join(
                      ' · ',
                    ) || '暂无'}
                  </Text>
                </VStack>
                <Spacer />
              </HStack>
            ) : null}
            {rows.map((d) => (
              <Link
                key={d.subscription.id}
                url={Script.createRunURLScheme(Script.name, {
                  subscription: d.subscription.id,
                })}
                frame={{ maxWidth: 'infinity', alignment: 'leading' }}
              >
                <VStack
                  alignment="leading"
                  frame={{
                    maxWidth: 'infinity',
                    minHeight: large ? 34 : mediumRowHeight,
                    maxHeight: large ? 34 : mediumRowHeight,
                    alignment: 'leading',
                  }}
                >
                  <SubscriptionRow
                    s={d.subscription}
                    date={date}
                    dense
                    widget
                    iconSize={large ? 28 : Math.min(34, mediumRowHeight - 2)}
                  />
                </VStack>
              </Link>
            ))}
            {large ? <Spacer /> : null}
            {large && overdue ? (
              <Link url={home}>
                <Text font={10} foregroundStyle={palette.red}>
                  {overdue} 笔逾期待确认
                </Text>
              </Link>
            ) : null}
          </VStack>
        )}
        <HStack spacing={3}>
          <Note snapshot={snapshot} demo={config.mode === 'demo'} />
          <Spacer />
          {small ? (
            <Text font={9} foregroundStyle={palette.muted}>
              共 {all.length} 笔
            </Text>
          ) : (
            <Link url={home}>
              <Text font={10} foregroundStyle={palette.accent}>
                全部 {snapshot.subscriptions.length} ›
              </Text>
            </Link>
          )}
        </HStack>
      </VStack>
    </VStack>
  )
}
