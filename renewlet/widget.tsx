import { Widget } from 'scripting'
import { today, type Family, type Snapshot } from './model'
import { readConfig, refresh, initial } from './state'
import { WidgetView } from './widget-view'
export async function widgetSnapshot(): Promise<Snapshot> {
  const config = readConfig(),
    cached = initial(config)
  if (config.mode === 'demo') return cached
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // The Home Screen extension must reach present even if a native request stalls.
    return await Promise.race([
      refresh(config),
      new Promise<Snapshot>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              ...cached,
              cached: true,
              notice: cached.fetchedAt
                ? '同步超时，显示上次数据'
                : '请先打开脚本同步订阅',
            }),
          8000,
        )
      }),
    ])
  } catch {
    return { ...cached, cached: true, notice: '请打开脚本检查连接' }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
async function run() {
  const config = readConfig(),
    snapshot = await widgetSnapshot(),
    size = Widget.displaySize
  const family: Family =
    Widget.family === 'systemSmall'
      ? 'systemSmall'
      : Widget.family === 'systemLarge'
        ? 'systemLarge'
        : 'systemMedium'
  const date = today(config.zone)
  // Icons, exchange rates and categories use the cache warmed by the main app.
  // No image downloads/decoding of full-size originals in the widget extension.
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
