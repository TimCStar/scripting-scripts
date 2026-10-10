import {
  Form,
  Section,
  Text,
  TextField,
  SecureField,
  Picker,
  Button,
  Widget,
  Dialog,
  Link,
  Navigation,
  NavigationLink,
  useState,
  fetch,
} from 'scripting'
import {
  readConfig,
  saveConnection,
  credential,
  disconnect,
  forget,
  resetDemo,
} from './state'
import {
  normalizeURL,
  today,
  type Config,
  type Mode,
  type Family,
} from './model'
import {
  RenewletClient,
  ClientError,
  errorMessage,
  type Fetcher,
  type Credential,
} from './client'
import { palette } from './ui'
import { IconDiagnostics } from './icon-diagnostics'
export function Settings() {
  const [original] = useState(readConfig),
    [url, setURL] = useState(original.baseURL),
    [mode, setMode] = useState<Mode>(original.mode),
    [days, setDays] = useState(original.days),
    [zone, setZone] = useState(original.zone),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [message, setMessage] = useState(
      '凭证保存在本机钥匙串，密码只在本次登录使用。',
    ),
    [busy, setBusy] = useState(false),
    [gate] = useState(() => ({ busy: false })),
    dismiss = Navigation.useDismiss()
  function draft(): Config {
    try {
      today(zone)
    } catch {
      throw new ClientError('时区无效，请输入 IANA 时区，例如 Asia/Shanghai')
    }
    return {
      baseURL: mode === 'demo' && !url.trim() ? '' : normalizeURL(url),
      mode,
      days,
      zone,
      revision: Date.now() + '-' + Math.random().toString(36).slice(2),
    }
  }
  async function connect(newLogin: boolean) {
    if (gate.busy) return
    gate.busy = true
    setBusy(true)
    try {
      const c = draft()
      let secret: Credential | undefined
      if (mode === 'public' && newLogin) {
        const token = await Dialog.prompt({
          title: 'Renewlet Public API Token',
          message: '在 Renewlet 设置中创建，只提供读取权限。',
          obscureText: true,
          placeholder: 'rlt_…',
        })
        if (token === null) return
        secret = { mode: 'public', token: token.trim() }
      } else if (mode === 'session' && newLogin) {
        if (!email.trim()) throw new ClientError('请先填写登录邮箱')
        if (!password) throw new ClientError('请填写登录密码')
        const submittedPassword = password
        setPassword('')
        const cl = new RenewletClient(c.baseURL, null, fetch as Fetcher),
          result = await cl.login(email, submittedPassword)
        if (result.ticket) {
          const methods = result.methods?.filter((v) =>
            ['totp', 'recovery_code'].includes(v),
          ) || ['totp']
          const choice =
            methods.length > 1
              ? await Dialog.actionSheet({
                  title: '两步验证',
                  actions: methods.map((v) => ({
                    label: v === 'totp' ? '身份验证器' : '恢复码',
                  })),
                })
              : 0
          if (choice === null) return
          const method = methods[choice] as 'totp' | 'recovery_code',
            code = await Dialog.prompt({
              title: method === 'totp' ? '输入六位验证码' : '输入恢复码',
              obscureText: method === 'recovery_code',
            })
          if (code === null) return
          secret = await cl.verify(result.ticket, code, method)
        } else secret = result.credential
      }
      if (mode !== 'demo') {
        secret = secret || credential(c) || undefined
        if (!secret)
          throw new ClientError('请先连接或登录，切换站点不能复用原站凭证')
        await new RenewletClient(c.baseURL, secret, fetch as Fetcher).list()
      }
      saveConnection(c, secret)
      setMessage('已保存，组件已请求更新。')
      dismiss()
    } catch (e) {
      setMessage(
        e instanceof ClientError
          ? errorMessage(e)
          : e instanceof Error && e.message.startsWith('请输入')
            ? e.message
            : '连接失败，请检查 HTTPS 地址、网络、凭证和站点版本',
      )
    } finally {
      gate.busy = false
      setBusy(false)
    }
  }
  async function logout(localOnly = false) {
    if (gate.busy) return
    if (
      !(await Dialog.confirm({
        title: localOnly ? '移除本机凭证？' : '退出登录？',
        message: localOnly
          ? '清除当前已保存连接的凭证和快照；不会撤销服务器会话。'
          : '撤销当前已保存连接的会话并移除本机凭证。',
      }))
    )
      return
    gate.busy = true
    setBusy(true)
    try {
      if (localOnly) forget(original)
      else await disconnect(original)
      setMessage('已移除凭证和快照。')
    } catch (e) {
      setMessage(errorMessage(e) + '；网络不可用时可选择仅移除本机凭证。')
    } finally {
      gate.busy = false
      setBusy(false)
    }
  }
  return (
    <Form
      navigationTitle="连接与组件"
      navigationBarTitleDisplayMode="inline"
      onDisappear={() => setPassword('')}
    >
      <Section
        header={<Text>你的 Renewlet</Text>}
        footer={
          <Text>
            使用站点根地址或部署子路径，不含
            /api。登录会话支持邮箱密码与身份验证器 / 恢复码。启用 Turnstile 或仅
            Passkey 的站点，可先使用只读 Token 并通过网页管理。
          </Text>
        }
      >
        <Picker
          title="连接模式"
          value={mode}
          onChanged={(v) => {
            setPassword('')
            setMode(v as Mode)
          }}
          disabled={busy}
        >
          <Text tag="demo">演示账本</Text>
          <Text tag="public">Public API · 只读</Text>
          <Text tag="session">登录会话 · 添加 / 编辑</Text>
        </Picker>
        <TextField
          title="站点地址"
          prompt="https://renewlet.example.com"
          value={url}
          onChanged={setURL}
          disabled={busy}
        />
        {mode === 'session' ? (
          <>
            <TextField
              title="登录邮箱"
              value={email}
              onChanged={setEmail}
              keyboardType="emailAddress"
              disabled={busy}
            />
            <SecureField
              title="登录密码"
              prompt="输入 Renewlet 密码"
              value={password}
              onChanged={setPassword}
              disabled={busy}
            />
          </>
        ) : null}
        {mode !== 'demo' ? (
          <Button
            title={
              busy
                ? '连接中…'
                : mode === 'session'
                  ? '登录并保存连接'
                  : '输入 Token 并保存连接'
            }
            action={() => connect(true)}
            disabled={busy}
          />
        ) : null}
        <Button
          title={
            mode === 'demo' ? '保存演示与偏好' : '保存偏好（保留本站已有凭证）'
          }
          action={() => connect(false)}
          disabled={busy}
        />
        <Text font={12} foregroundStyle={palette.muted}>
          {message}
        </Text>
      </Section>
      <Section
        header={<Text>续订窗口</Text>}
        footer={
          <Text>
            组件只显示进行中 /
            试用中的未来项目。永久买断、暂停、取消和已到期记录不挤占组件；逾期账单在主列表单独筛选。组件约
            30 分钟申请刷新，具体时间由 iOS 决定。
          </Text>
        }
      >
        <Picker
          title="组件未来天数"
          value={days}
          onChanged={(v) => setDays(Number(v))}
        >
          {[7, 14, 30, 60, 90].map((n) => (
            <Text key={n} tag={n}>
              {n} 天
            </Text>
          ))}
        </Picker>
        <TextField
          title="账本时区"
          prompt="Asia/Shanghai"
          value={zone}
          onChanged={setZone}
        />
        <Text font={11} foregroundStyle={palette.muted}>
          使用与 Renewlet 账户相同的时区。日期不会按 UTC 午夜错误减一天。
        </Text>
      </Section>
      <Section header={<Text>组件预览</Text>}>
        {(['systemSmall', 'systemMedium', 'systemLarge'] as Family[]).map(
          (f, i) => (
            <Button
              key={f}
              title={['预览小号', '预览中号', '预览大号'][i]}
              action={() => Widget.preview({ family: f })}
            />
          ),
        )}
        <Text font={11} foregroundStyle={palette.muted}>
          预览使用已保存连接；修改偏好后请先保存。
        </Text>
      </Section>
      {original.mode !== 'demo' ? (
        <Section header={<Text>当前已保存连接</Text>}>
          <NavigationLink destination={<IconDiagnostics />}>
            <Text>图标检查与重新加载</Text>
          </NavigationLink>
          <Text font={12} foregroundStyle={palette.muted}>
            {original.baseURL}
          </Text>
          <Button
            title="退出并移除凭证"
            action={() => logout()}
            disabled={busy}
          />
          <Button
            title="仅移除本机凭证和快照"
            action={() => logout(true)}
            disabled={busy}
          />
        </Section>
      ) : (
        <Section>
          <Button
            title="恢复虚构演示账本"
            action={async () => {
              if (
                await Dialog.confirm({
                  title: '重置演示？',
                  message: '清除本机演示账本的修改，不影响服务器数据。',
                })
              ) {
                resetDemo()
                setMessage('演示账本已恢复。')
              }
            }}
          />
        </Section>
      )}
      {url.startsWith('https://') ? (
        <Section>
          <Link url={url}>
            <Text foregroundStyle={palette.accent}>打开 Renewlet 网页 ↗</Text>
          </Link>
        </Section>
      ) : null}
    </Form>
  )
}
