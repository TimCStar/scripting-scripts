import { VStack, HStack, Text, Image, Spacer, Link, Script } from 'scripting'
import {
  upcoming,
  dueFor,
  totals,
  priceLabel,
  type Snapshot,
  type Config,
  type Family,
} from './model'
import { palette, SubscriptionRow, Note, Countdown } from './ui'
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
  const all = upcoming(snapshot.subscriptions, date, config.days),
    limit = small ? 1 : large ? (height < 370 ? 4 : 5) : 3,
    rows = all.slice(0, limit),
    next = rows[0]
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
        spacing={small ? 5 : large ? 10 : 5}
        padding={{ horizontal: small ? 14 : 16, vertical: 12 }}
        frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      >
        {small ? (
          <HStack spacing={5}>
            <Image
              systemName="calendar.badge.clock"
              font={11}
              foregroundStyle={palette.accent}
            />
            <Text
              font={10}
              fontWeight="semibold"
              foregroundStyle={palette.muted}
            >
              续订手札
            </Text>
            <Spacer />
          </HStack>
        ) : (
          <Link url={home} frame={{ maxWidth: 'infinity' }}>
            <HStack>
              <Text
                font={10}
                fontWeight="semibold"
                foregroundStyle={palette.accent}
              >
                RENEWLET / 续订手札
              </Text>
              <Spacer />
              <Text font={10} foregroundStyle={palette.muted}>
                {config.days} 天内 · {all.length} 笔
              </Text>
            </HStack>
          </Link>
        )}
        {!next ? (
          <VStack
            alignment="leading"
            spacing={7}
            frame={{ maxHeight: 'infinity' }}
          >
            <Spacer />
            <Image
              systemName={
                snapshot.cached ? 'wifi.exclamationmark' : 'checkmark.seal'
              }
              font={24}
              foregroundStyle={palette.accent}
            />
            <Text
              font={small ? 16 : 19}
              fontWeight="semibold"
              foregroundStyle={palette.ink}
            >
              {snapshot.cached ? '同步暂未完成' : '给未来留点余白。'}
            </Text>
            <Text font={11} foregroundStyle={palette.muted}>
              {snapshot.notice || `未来 ${config.days} 天没有待续订项目`}
            </Text>
            <Spacer />
          </VStack>
        ) : small ? (
          <VStack
            alignment="leading"
            spacing={4}
            frame={{ maxHeight: 'infinity' }}
          >
            <Text
              font={14}
              fontWeight="semibold"
              foregroundStyle={palette.ink}
              lineLimit={1}
              minScaleFactor={0.6}
            >
              {next.subscription.name}
            </Text>
            <Countdown d={next} compact />
            <Spacer />
            <Text
              font={11}
              foregroundStyle={palette.ink}
              monospacedDigit
              lineLimit={1}
              minScaleFactor={0.7}
            >
              {priceLabel(next.subscription)}
            </Text>
          </VStack>
        ) : large ? (
          <VStack
            alignment="leading"
            spacing={10}
            frame={{ maxHeight: 'infinity' }}
          >
            <HStack>
              <VStack alignment="leading" spacing={3}>
                <Text
                  font={23}
                  fontWeight="semibold"
                  foregroundStyle={palette.ink}
                >
                  下次，心中有数。
                </Text>
                <Text font={10} foregroundStyle={palette.muted}>
                  {overdue
                    ? `${overdue} 笔逾期 · 打开确认`
                    : '最近到期优先 · 自动与手动续订'}
                </Text>
              </VStack>
              <Spacer />
              <Image
                systemName="calendar"
                font={25}
                foregroundStyle={palette.accent}
              />
            </HStack>
            {rows.map((d) => (
              <Link
                key={d.subscription.id}
                url={Script.createRunURLScheme(Script.name, {
                  subscription: d.subscription.id,
                })}
                frame={{ maxWidth: 'infinity' }}
              >
                <SubscriptionRow s={d.subscription} date={date} dense />
              </Link>
            ))}
            <Spacer />
            <Text
              font={10}
              foregroundStyle={palette.muted}
              lineLimit={1}
              minScaleFactor={0.65}
            >
              未来 7 天标价 ·{' '}
              {totals(upcoming(snapshot.subscriptions, date, 7)).join(' · ') ||
                '暂无'}{' '}
              · 分摊前
            </Text>
          </VStack>
        ) : (
          <HStack
            alignment="top"
            spacing={18}
            frame={{ maxHeight: 'infinity' }}
          >
            <Link
              url={Script.createRunURLScheme(Script.name, {
                subscription: next.subscription.id,
              })}
            >
              <VStack
                alignment="leading"
                spacing={3}
                frame={{ width: width < 330 ? 94 : 110 }}
              >
                <Text
                  font={12}
                  fontWeight="semibold"
                  foregroundStyle={palette.ink}
                  lineLimit={1}
                >
                  {next.subscription.name}
                </Text>
                <Countdown d={next} compact fontSize={32} />
                <Text
                  font={10}
                  foregroundStyle={palette.ink}
                  lineLimit={1}
                  minScaleFactor={0.65}
                >
                  {priceLabel(next.subscription)}
                </Text>
              </VStack>
            </Link>
            <VStack
              alignment="leading"
              spacing={10}
              frame={{ maxWidth: 'infinity' }}
            >
              {rows.slice(1).map((d) => (
                <Link
                  key={d.subscription.id}
                  url={Script.createRunURLScheme(Script.name, {
                    subscription: d.subscription.id,
                  })}
                >
                  <VStack alignment="leading" spacing={3}>
                    <Text
                      font={12}
                      fontWeight="medium"
                      foregroundStyle={palette.ink}
                      lineLimit={1}
                    >
                      {d.subscription.name}
                    </Text>
                    <Text
                      font={10}
                      foregroundStyle={palette.muted}
                      lineLimit={1}
                      minScaleFactor={0.65}
                    >
                      {d.date.slice(5).replace('-', '/')} ·{' '}
                      {priceLabel(d.subscription)}
                    </Text>
                  </VStack>
                </Link>
              ))}
              {rows.length === 1 ? (
                <Text font={11} foregroundStyle={palette.muted}>
                  这一笔，记得就好。
                </Text>
              ) : null}
              <Spacer />
            </VStack>
          </HStack>
        )}
        <HStack>
          <Note snapshot={snapshot} demo={config.mode === 'demo'} />
          <Spacer />
          {!small ? (
            <Link url={home}>
              <Text
                font={10}
                foregroundStyle={palette.accent}
              >{`全部 ${snapshot.subscriptions.length} ›`}</Text>
            </Link>
          ) : null}
        </HStack>
        {snapshot.cached && next ? (
          <Text font={8} foregroundStyle={palette.muted} lineLimit={1}>
            {snapshot.notice || '旧快照，请打开刷新'}
          </Text>
        ) : null}
      </VStack>
    </VStack>
  )
}
