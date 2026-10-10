import { Widget } from 'scripting'
import { today, type Family } from './model'
import { readConfig, refresh } from './state'
import { WidgetView } from './widget-view'
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
  Widget.present(
    <WidgetView
      snapshot={snapshot}
      config={config}
      family={family}
      date={today(config.zone)}
      width={size.width}
      height={size.height}
    />,
    { policy: 'after', date: new Date(Date.now() + 30 * 60000) },
  )
}
run()
