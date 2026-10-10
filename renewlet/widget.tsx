import { Widget } from 'scripting'
import { today, upcoming, type Family } from './model'
import { readConfig, refresh, loadLogos } from './state'
import { WidgetView, widgetLimit } from './widget-view'
async function run() {
  const config = readConfig(),
    snapshot = await refresh(config),
    size = Widget.displaySize
  const family: Family =
    Widget.family === 'systemSmall'
      ? 'systemSmall'
      : Widget.family === 'systemLarge'
        ? 'systemLarge'
        : 'systemMedium'
  const date = today(config.zone)
  await loadLogos(
    config,
    upcoming(snapshot.subscriptions, date, config.days)
      .slice(0, widgetLimit(family, size.height))
      .map((d) => d.subscription),
  )
  Widget.present(
    <WidgetView
      snapshot={snapshot}
      config={config}
      family={family}
      date={date}
      width={size.width}
      height={size.height}
    />,
    { policy: 'after', date: new Date(Date.now() + 30 * 60000) },
  )
}
run()
