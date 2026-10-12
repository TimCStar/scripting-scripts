import {
  List,
  Section,
  VStack,
  HStack,
  Text,
  Spacer,
  NavigationLink,
  Button,
  Navigation,
  NavigationStack,
  Link,
  useState,
} from 'scripting'
import {
  detail,
  initial,
  readConfig,
  loadLogos,
  loadDisplayData,
} from './state'
import {
  today,
  dueFor,
  dueLabel,
  dueTypes,
  cycleLabel,
  priceLabel,
  statuses,
  type Subscription,
} from './model'
import { palette, SubscriptionIcon, SubscriptionPrice } from './ui'
import { errorMessage } from './client'
import {
  displayCategory,
  displayPaymentMethod,
  readRates,
} from './display-data'
import { repeatReminderLabel } from './presentation'
import { Editor } from './editor'
function Field({ title, value }: { title: string; value: string }) {
  return (
    <HStack alignment="top">
      <Text foregroundStyle={palette.muted}>{title}</Text>
      <Spacer />
      <Text foregroundStyle={palette.ink}>{value}</Text>
    </HStack>
  )
}
export function Detail({ id, home }: { id: string; home?: () => any }) {
  const [config] = useState(readConfig),
    [s, setS] = useState<Subscription | null>(
      () => initial(config).subscriptions.find((s) => s.id === id) || null,
    ),
    [ready, setReady] = useState(config.mode === 'demo'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [gate] = useState(() => ({ active: true, serial: 0, busy: false }))
  async function reload() {
    if (gate.busy) return
    const serial = ++gate.serial
    gate.busy = true
    setBusy(true)
    setReady(false)
    try {
      const fresh = await detail(config, id)
      if (gate.active && serial === gate.serial) {
        setS(fresh)
        setReady(true)
        setMessage('')
        await Promise.all([loadLogos(config, [fresh]), loadDisplayData(config)])
        if (gate.active && serial === gate.serial) setS({ ...fresh })
      }
    } catch (e) {
      if (gate.active && serial === gate.serial) setMessage(errorMessage(e))
    } finally {
      if (serial === gate.serial) {
        gate.busy = false
        if (gate.active) setBusy(false)
      }
    }
  }
  async function edit() {
    if (!s || !ready) return
    await Navigation.present({
      element: (
        <NavigationStack>
          <Editor config={config} before={s} onSaved={setS} />
        </NavigationStack>
      ),
    })
    await reload()
  }
  const date = today(config.zone),
    d = s ? dueFor(s, date) : null
  return (
    <List
      navigationTitle={s?.name || '订阅详情'}
      navigationBarTitleDisplayMode="inline"
      onAppear={() => {
        gate.active = true
        reload()
      }}
      onDisappear={() => {
        gate.active = false
        gate.serial++
        gate.busy = false
      }}
      refreshable={reload}
      toolbar={{
        topBarTrailing: [
          <Button
            title={busy ? '读取中' : '刷新'}
            action={reload}
            disabled={busy}
          />,
          <Button
            title="编辑"
            action={edit}
            disabled={!ready || config.mode === 'public' || busy}
          />,
        ],
      }}
    >
      {home ? (
        <Section>
          <NavigationLink destination={home()}>
            <Text foregroundStyle={palette.accent}>全部订阅 ›</Text>
          </NavigationLink>
        </Section>
      ) : null}
      {message ? (
        <Section>
          <Text foregroundStyle={palette.red}>{message}</Text>
          <Text font={11} foregroundStyle={palette.muted}>
            未确认最新详情，暂不允许编辑。
          </Text>
        </Section>
      ) : null}
      {s ? (
        <>
          <Section>
            <VStack alignment="leading" spacing={16} padding={{ vertical: 12 }}>
              <HStack spacing={12}>
                <SubscriptionIcon s={s} size={54} />
                <VStack
                  alignment="leading"
                  spacing={6}
                  frame={{ maxWidth: 'infinity', alignment: 'leading' }}
                >
                  <Text
                    font={23}
                    fontWeight="semibold"
                    foregroundStyle={palette.ink}
                  >
                    {s.name}
                  </Text>
                  <Text foregroundStyle={palette.muted}>
                    {cycleLabel(s)} · {statuses[s.status]}
                  </Text>
                </VStack>
              </HStack>
              <VStack alignment="leading" spacing={8}>
                <SubscriptionPrice s={s} font={23} />
                <Text
                  font={13}
                  fontWeight="semibold"
                  foregroundStyle={palette.ink}
                >
                  {dueLabel(d)}
                  {d ? ` · ${dueTypes[d.type]}` : ''}
                </Text>
              </VStack>
              {!ready ? (
                <Text font={11} foregroundStyle={palette.muted}>
                  列表快照 · 正在读取完整详情
                </Text>
              ) : null}
            </VStack>
          </Section>
          <Section header={<Text>账单档案</Text>}>
            <Field title="分类" value={displayCategory(config, s.category)} />
            <Field title="开始日期" value={s.startDate || '未知'} />
            <Field title="下次日期" value={s.nextBillingDate} />
            {s.trialEndDate ? (
              <Field title="试用结束" value={s.trialEndDate} />
            ) : null}
            <Field title="自动续订" value={s.autoRenew ? '开启' : '关闭'} />
            <Field
              title="自动计算日期"
              value={s.autoCalculateNextBillingDate ? '开启' : '关闭'}
            />
            <Field
              title="支付方式"
              value={displayPaymentMethod(config, s.paymentMethod) || '未填写'}
            />
            <Field
              title="提醒"
              value={
                s.reminderDays === -2
                  ? '静默'
                  : s.reminderDays === -1
                    ? '继承账户设置'
                    : `提前 ${s.reminderDays} 天`
              }
            />
            <Field title="重复提醒" value={repeatReminderLabel(s)} />
            <Field
              title="可见性"
              value={s.publicHidden ? '不公开' : '可公开'}
            />
            <Field title="置顶" value={s.pinned ? '是' : '否'} />
          </Section>
          <Section header={<Text>备忘</Text>}>
            <Text foregroundStyle={palette.ink}>{s.notes || '暂无备注'}</Text>
            <Text font={12} foregroundStyle={palette.muted}>
              {s.tags.length ? s.tags.join(' · ') : '暂无标签'}
            </Text>
            {s.website && /^https?:\/\//.test(s.website) ? (
              <Link url={s.website}>
                <Text foregroundStyle={palette.accent}>访问订阅网站 ↗</Text>
              </Link>
            ) : null}
          </Section>
          {s.costSharing ? (
            <Section header={<Text>家庭分摊</Text>}>
              <Text>
                标价 {priceLabel(s)} · 分摊
                {s.costSharing.enabled ? '开启' : '关闭'}
              </Text>
              <Text font={12} foregroundStyle={palette.muted}>
                本脚本展示分摊前价格。成员、收款账本与高级设置在 Renewlet
                网页管理，编辑保留这些字段。
              </Text>
            </Section>
          ) : null}
          <Section header={<Text>记录</Text>}>
            {s.currency !== 'CNY' ? (
              <Text font={11} foregroundStyle={palette.muted}>
                {config.mode === 'demo'
                  ? '演示汇率 · 非真实报价'
                  : readRates(config)
                    ? '参考汇率 · ' + readRates(config)!.date
                    : '参考汇率暂不可用'}
              </Text>
            ) : null}
            <Field title="ID" value={s.id} />
            <Field title="更新" value={s.updatedAt || '服务端未提供'} />
            <Text font={11} foregroundStyle={palette.muted}>
              日期按 {config.zone} 计算倒计时。自动续订标记不代表已支付。
            </Text>
            {config.mode === 'public' ? (
              <Text foregroundStyle={palette.muted}>
                当前为只读 Token 模式，在设置中登录即可添加与编辑。
              </Text>
            ) : null}
          </Section>
        </>
      ) : (
        <Section>
          <Text foregroundStyle={palette.muted}>
            {busy ? '正在读取订阅…' : '找不到这笔订阅，返回全部列表刷新。'}
          </Text>
        </Section>
      )}
      {config.baseURL ? (
        <Section>
          <Link url={config.baseURL + '/subscriptions'}>
            <Text foregroundStyle={palette.accent}>打开 Renewlet 网页 ↗</Text>
          </Link>
        </Section>
      ) : null}
    </List>
  )
}
