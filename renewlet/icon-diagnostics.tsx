import {
  Form,
  Section,
  Text,
  VStack,
  Button,
  Widget,
  useState,
} from 'scripting'
import { readConfig, refresh, credential } from './state'
import { prepareLogos, type LogoCheck } from './icons'
import { palette } from './ui'

export function IconDiagnostics() {
  const [config] = useState(readConfig),
    [results, setResults] = useState<LogoCheck[]>([]),
    [message, setMessage] = useState('检查已保存连接中的订阅图标。'),
    [busy, setBusy] = useState(false),
    [gate] = useState(() => ({ busy: false }))
  async function check() {
    if (gate.busy) return
    gate.busy = true
    setBusy(true)
    setResults([])
    setMessage('正在读取订阅…')
    try {
      const snapshot = await refresh(config)
      if (readConfig().revision !== config.revision) {
        setMessage('连接已改变，请返回设置后重新打开。')
        return
      }
      setMessage(`正在重新下载 ${snapshot.subscriptions.length} 笔订阅的图标…`)
      const checked = await prepareLogos(
        config,
        snapshot.subscriptions,
        credential(config),
        true,
      )
      if (readConfig().revision !== config.revision) {
        setMessage('连接已改变，请返回设置后重新打开。')
        return
      }
      setResults(checked)
      const success = checked.filter((item) => item.ok).length
      setMessage(
        `${checked.length} 笔 · ${success} 笔通过检查${snapshot.cached ? ' · 使用上次订阅快照' : ''}${snapshot.notice ? '。' + snapshot.notice : ''}`,
      )
      Widget.reloadAll()
    } catch {
      setMessage('图标检查未完成，请检查已保存的连接后重试。')
    } finally {
      gate.busy = false
      setBusy(false)
    }
  }
  return (
    <Form navigationTitle="图标检查" navigationBarTitleDisplayMode="inline">
      <Section
        footer={
          <Text>
            重新下载保留已有图标，每个请求最多等待 15
            秒。完成后请求组件更新；实际更新时间由 iOS 决定。
          </Text>
        }
      >
        <Button
          title={busy ? '检查中…' : '检查并重新加载图标'}
          action={check}
          disabled={busy}
        />
        <Text font={12} foregroundStyle={palette.muted}>
          {message}
        </Text>
      </Section>
      {results.length ? (
        <Section
          header={<Text>检查结果</Text>}
          footer={
            <Text>
              SVG
              通过检查表示文件已下载且格式检查通过；若仍空白，需进一步检查设备渲染。这里只展示来源域名，不显示链接参数或凭证。
            </Text>
          }
        >
          {results.map((item) => (
            <VStack key={item.id} alignment="leading" spacing={4}>
              <Text font={15} foregroundStyle={palette.ink}>
                {item.name}
              </Text>
              <Text
                font={12}
                foregroundStyle={item.ok ? palette.green : palette.amber}
              >
                {item.message}
                {item.retained ? ' · 已保留缓存或包内图标' : ''}
              </Text>
              <Text font={11} foregroundStyle={palette.muted}>
                {item.source}
              </Text>
            </VStack>
          ))}
        </Section>
      ) : null}
    </Form>
  )
}
