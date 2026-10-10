import {
  Form,
  Section,
  Text,
  TextField,
  Picker,
  DatePicker,
  Toggle,
  Button,
  Navigation,
  Dialog,
  useState,
} from 'scripting'
import {
  newSubscription,
  today,
  cycles,
  statuses,
  units,
  formPayload,
  localDate,
  pickerDate,
  type Config,
  type Subscription,
} from './model'
import { save } from './state'
import { ClientError, errorMessage } from './client'
import { palette } from './ui'
export function Editor({
  config,
  before = null,
  onSaved,
}: {
  config: Config
  before?: Subscription | null
  onSaved?: (s: Subscription) => void
}) {
  const [s, setS] = useState<Subscription>(() =>
    before
      ? { ...before, tags: [...before.tags] }
      : newSubscription(today(config.zone)),
  )
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [lock] = useState(() => ({ busy: false })),
    dismiss = Navigation.useDismiss()
  const [tagsText, setTagsText] = useState((before?.tags || []).join(', ')),
    [reminderText, setReminderText] = useState(
      String(before?.reminderDays ?? -1),
    ),
    [customText, setCustomText] = useState(String(before?.customDays ?? 1)),
    [termText, setTermText] = useState(String(before?.oneTimeTermCount ?? 1))
  function update<K extends keyof Subscription>(k: K, v: Subscription[K]) {
    setS({ ...s, [k]: v })
  }
  async function submit() {
    if (lock.busy) return
    const draft: Subscription = {
      ...s,
      tags: tagsText
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
      reminderDays: Number(reminderText),
      customDays: Number(customText),
      oneTimeTermCount:
        s.oneTimeTermCount === undefined ? undefined : Number(termText),
    }
    // Model validation errors are safe, locally authored messages.
    try {
      if (
        !reminderText.trim() ||
        (s.billingCycle === 'custom' && !customText.trim()) ||
        (s.oneTimeTermCount !== undefined && !termText.trim())
      )
        throw new Error('请填写完整的提醒天数和周期长度')
      formPayload(draft)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '表单无效')
      return
    }
    lock.busy = true
    setBusy(true)
    try {
      if (
        !(await Dialog.confirm({
          title: before ? '保存修改？' : '添加订阅？',
          message: `${s.name} · ${s.currency} ${s.price}\n${config.mode === 'demo' ? '只保存到本机演示账本。' : '将保存到当前 Renewlet 账户。'}`,
          confirmLabel: '保存',
          cancelLabel: '继续编辑',
        }))
      )
        return
      const result = await save(config, before, draft)
      onSaved?.(result)
      dismiss()
    } catch (e) {
      setMessage(
        e instanceof ClientError
          ? errorMessage(e)
          : '保存未确认，请先回到列表刷新；避免重复添加',
      )
    } finally {
      lock.busy = false
      setBusy(false)
    }
  }
  return (
    <Form
      navigationTitle={before ? '编辑订阅' : '添加订阅'}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        confirmationAction: (
          <Button
            title={busy ? '保存中…' : '保存'}
            action={submit}
            disabled={busy}
          />
        ),
        cancellationAction: (
          <Button title="取消" action={dismiss} disabled={busy} />
        ),
      }}
    >
      <Section header={<Text>订阅名片</Text>}>
        <TextField
          title="名称"
          prompt="例如 iCloud+"
          value={s.name}
          onChanged={(v) => update('name', v)}
        />
        <TextField
          title="价格"
          value={s.price}
          onChanged={(v) => update('price', v)}
          keyboardType="decimalPad"
        />
        <TextField
          title="币种"
          prompt="CNY / USD / EUR"
          value={s.currency}
          onChanged={(v) => update('currency', v.toUpperCase().trim())}
        />
        <TextField
          title="分类"
          value={s.category}
          onChanged={(v) => update('category', v)}
        />
        <Picker
          title="状态"
          value={s.status}
          onChanged={(v) => update('status', v as Subscription['status'])}
        >
          {Object.entries(statuses).map(([k, v]) => (
            <Text key={k} tag={k}>
              {v}
            </Text>
          ))}
        </Picker>
      </Section>
      <Section
        header={<Text>周期与日期</Text>}
        footer={
          <Text>
            自动日期计算由 Renewlet
            服务端处理。日期为账本日历日期，请在设置中使用与账户一致的时区。
          </Text>
        }
      >
        <Picker
          title="计费周期"
          value={s.billingCycle}
          onChanged={(v) =>
            setS({
              ...s,
              billingCycle: v as Subscription['billingCycle'],
              customDays: s.customDays || 1,
              customCycleUnit: s.customCycleUnit || 'month',
              autoRenew: v === 'one-time' ? false : s.autoRenew,
              autoCalculateNextBillingDate:
                v === 'one-time' ? false : s.autoCalculateNextBillingDate,
            })
          }
        >
          {Object.entries(cycles).map(([k, v]) => (
            <Text key={k} tag={k}>
              {v}
            </Text>
          ))}
        </Picker>
        {s.billingCycle === 'custom' ? (
          <>
            <TextField
              title="每隔多少"
              value={customText}
              onChanged={setCustomText}
              keyboardType="numberPad"
            />
            <Picker
              title="周期单位"
              value={s.customCycleUnit || 'month'}
              onChanged={(v) =>
                update('customCycleUnit', v as keyof typeof units)
              }
            >
              {Object.entries(units).map(([k, v]) => (
                <Text key={k} tag={k}>
                  {v}
                </Text>
              ))}
            </Picker>
          </>
        ) : null}
        {s.billingCycle === 'one-time' ? (
          <>
            <Toggle
              title="固定权益期（关闭为永久买断）"
              value={!!s.oneTimeTermCount}
              onChanged={(v) =>
                setS({
                  ...s,
                  oneTimeTermCount: v ? 1 : undefined,
                  oneTimeTermUnit: v ? 'year' : undefined,
                })
              }
            />
            {s.oneTimeTermCount !== undefined ? (
              <>
                <TextField
                  title="期限长度"
                  value={termText}
                  onChanged={setTermText}
                  keyboardType="numberPad"
                />
                <Picker
                  title="期限单位"
                  value={s.oneTimeTermUnit || 'year'}
                  onChanged={(v) =>
                    update('oneTimeTermUnit', v as keyof typeof units)
                  }
                >
                  {Object.entries(units).map(([k, v]) => (
                    <Text key={k} tag={k}>
                      {v}
                    </Text>
                  ))}
                </Picker>
              </>
            ) : null}
          </>
        ) : null}
        <Toggle
          title="知道开始日期"
          value={s.startDate !== null}
          onChanged={(v) => update('startDate', v ? today(config.zone) : null)}
        />
        {s.startDate ? (
          <DatePicker
            title="开始日期"
            value={pickerDate(s.startDate)}
            displayedComponents={['date']}
            onChanged={(v) => update('startDate', localDate(v))}
          />
        ) : null}
        <DatePicker
          title={
            s.billingCycle === 'one-time' ? '权益到期 / 记录日期' : '下次续订'
          }
          value={pickerDate(s.nextBillingDate)}
          displayedComponents={['date']}
          onChanged={(v) => update('nextBillingDate', localDate(v))}
        />
        {s.billingCycle !== 'one-time' ? (
          <>
            <Toggle
              title="自动续订"
              value={s.autoRenew}
              onChanged={(v) => update('autoRenew', v)}
            />
            <Toggle
              title="自动计算下次日期"
              value={s.autoCalculateNextBillingDate}
              onChanged={(v) => update('autoCalculateNextBillingDate', v)}
            />
          </>
        ) : null}
        {s.status === 'trial' ? (
          <>
            <Toggle
              title="指定试用结束日期"
              value={!!s.trialEndDate}
              onChanged={(v) =>
                update('trialEndDate', v ? s.nextBillingDate : undefined)
              }
            />
            {s.trialEndDate ? (
              <DatePicker
                title="试用结束"
                value={pickerDate(s.trialEndDate)}
                displayedComponents={['date']}
                onChanged={(v) => update('trialEndDate', localDate(v))}
              />
            ) : null}
          </>
        ) : null}
      </Section>
      <Section
        header={<Text>备忘与提醒</Text>}
        footer={
          <Text>
            提醒天数：-1 继承账户设置，-2 静默，0 当天提醒。通知由 Renewlet
            发送。家庭分摊与重复提醒请在网页设置。
          </Text>
        }
      >
        <TextField
          title="支付方式"
          prompt="可留空"
          value={s.paymentMethod || ''}
          onChanged={(v) => update('paymentMethod', v)}
        />
        <TextField
          title="网站"
          prompt="https://…"
          value={s.website || ''}
          onChanged={(v) => update('website', v.trim())}
        />
        <TextField
          title="标签"
          prompt="逗号分隔"
          value={tagsText}
          onChanged={setTagsText}
        />
        <TextField
          title="提前提醒天数"
          value={reminderText}
          onChanged={setReminderText}
        />
        <TextField
          title="备注"
          axis="vertical"
          lineLimit={{ min: 3, max: 8 }}
          value={s.notes || ''}
          onChanged={(v) => update('notes', v)}
        />
      </Section>
      {message ? (
        <Section>
          <Text foregroundStyle={palette.red}>{message}</Text>
        </Section>
      ) : null}
      <Section>
        <Button
          title={busy ? '保存中…' : '保存订阅'}
          action={submit}
          disabled={busy}
          buttonStyle="borderedProminent"
        />
        <Text font={11} foregroundStyle={palette.muted}>
          {config.mode === 'demo'
            ? '演示账本 · 本机保存'
            : before
              ? '仅提交修改字段 · 保留高级配置'
              : '新增到当前 Renewlet 账户'}
        </Text>
      </Section>
    </Form>
  )
}
