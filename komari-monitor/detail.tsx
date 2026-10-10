import {
  List,
  Section,
  VStack,
  HStack,
  Text,
  Picker,
  Button,
  NavigationLink,
  useState,
  useEffect,
} from 'scripting'
import {
  bytes,
  speed,
  uptime,
  percent,
  expiry,
  timeLabel,
  traffic,
  ratio,
  type Node,
  type Sample,
} from './model'
import {
  palette,
  StatusBadge,
  Reading,
  Resource,
  Trend,
  UpdateNote,
} from './ui'
import { loadHistory } from './state'
import { errorMessage } from './client'
import { useMonitor } from './monitor'
function Fact({ title, value }: { title: string; value: string }) {
  return (
    <HStack spacing={12}>
      <Text font={13} foregroundStyle={palette.muted}>
        {title}
      </Text>
      <Text
        font={13}
        foregroundStyle={palette.ink}
        frame={{ maxWidth: 'infinity', alignment: 'trailing' }}
      >
        {value}
      </Text>
    </HStack>
  )
}
export function Detail({ id, home }: { id: string; home?: () => JSX.Element }) {
  const m = useMonitor(),
    n = m.snapshot.nodes.find((n) => n.id === id),
    [hours, setHours] = useState(1),
    [metric, setMetric] = useState<'cpu' | 'memory' | 'disk'>('cpu'),
    [history, setHistory] = useState<Sample[]>(n?.history || []),
    [historyNote, setHistoryNote] = useState(''),
    [chartBusy, setChartBusy] = useState(false)
  const [control] = useState(() => ({ epoch: 0, active: false }))
  async function chart() {
    if (!n) return
    const epoch = ++control.epoch
    setChartBusy(true)
    setHistoryNote('')
    try {
      const result = await loadHistory(m.config, n, hours, m.snapshot.transport)
      if (control.active && epoch === control.epoch) {
        setHistory(result)
        setHistoryNote(
          result.length ? '' : '服务器未提供历史记录（可能未启用记录）',
        )
      }
    } catch (e) {
      if (control.active && epoch === control.epoch) {
        setHistory([])
        setHistoryNote(errorMessage(e))
      }
    } finally {
      if (control.active && epoch === control.epoch) setChartBusy(false)
    }
  }
  useEffect(() => {
    if (control.active) void chart()
  }, [hours, n?.id, m.config.revision])
  const s = n?.status,
    amount = n ? traffic(n) : null
  return (
    <List
      navigationTitle={n?.name || 'VPS 详情'}
      navigationBarTitleDisplayMode="inline"
      onAppear={() => {
        control.active = true
        m.appear()
        void chart()
      }}
      onDisappear={() => {
        control.active = false
        control.epoch++
        m.disappear()
      }}
      refreshable={async () => {
        await m.reload()
        await chart()
      }}
      toolbar={{
        topBarTrailing: (
          <Button
            title={m.busy ? '更新中' : '刷新'}
            action={async () => {
              await m.reload()
              await chart()
            }}
          />
        ),
      }}
    >
      {home ? (
        <Section>
          <NavigationLink destination={home()}>
            <Text foregroundStyle={palette.teal}>‹ 全部 VPS 监控</Text>
          </NavigationLink>
        </Section>
      ) : null}
      {!n ? (
        <Section>
          <Text>该节点已移除、不可见或尚未读取。</Text>
          <Text>{m.snapshot.notice || '请返回全部 VPS 监控并刷新。'}</Text>
        </Section>
      ) : (
        <>
          <Section>
            <VStack alignment="leading" spacing={12} padding={{ vertical: 8 }}>
              <HStack>
                <Text
                  font={11}
                  foregroundStyle={palette.muted}
                >{`${n.region} / ${n.group}`}</Text>
                <StatusBadge node={n} cached={m.snapshot.cached} />
              </HStack>
              <HStack spacing={16}>
                <Reading
                  title="CPU 使用率"
                  value={percent(s?.cpu ?? null)}
                  accent
                />
                <Reading title="持续运行" value={uptime(s?.uptime ?? null)} />
              </HStack>
              <UpdateNote
                time={s?.time || m.snapshot.fetchedAt}
                cached={m.snapshot.cached}
                demo={m.config.demo}
              />
            </VStack>
            {m.snapshot.notice ? (
              <Text font={11} foregroundStyle={palette.muted}>
                {m.snapshot.notice}
              </Text>
            ) : null}
          </Section>
          <Section header={<Text>资源水位</Text>}>
            <Resource
              label="内存"
              value={s?.memory ?? null}
              detail={`${bytes(s?.ramUsed ?? null)} / ${bytes(s?.ramTotal ?? n.memoryTotal)}`}
              large
              color={palette.blue}
            />
            <Resource
              label="磁盘"
              value={s?.disk ?? null}
              detail={`${bytes(s?.diskUsed ?? null)} / ${bytes(s?.diskTotal ?? n.diskTotal)}`}
              large
            />
            <Fact
              title="Swap"
              value={`${bytes(s?.swapUsed ?? null)} / ${bytes(s?.swapTotal ?? null)}`}
            />
            <Fact
              title="负载 1 / 5 / 15 分钟"
              value={[s?.load, s?.load5, s?.load15]
                .map((v) =>
                  v === null || v === undefined ? '—' : v.toFixed(2),
                )
                .join(' / ')}
            />
            <Fact
              title="进程 / TCP / UDP"
              value={`${s?.process ?? '—'} / ${s?.tcp ?? '—'} / ${s?.udp ?? '—'}`}
            />
          </Section>
          <Section header={<Text>负载轨迹</Text>}>
            <Picker
              title="时间窗口"
              value={hours}
              onChanged={(value) => setHours(Number(value))}
              pickerStyle="segmented"
            >
              {[1, 6, 24].map((h) => (
                <Text key={String(h)} tag={h}>
                  {h}h
                </Text>
              ))}
            </Picker>
            <Picker
              title="指标"
              value={metric}
              onChanged={(value) => {
                if (['cpu', 'memory', 'disk'].includes(String(value)))
                  setMetric(value as typeof metric)
              }}
              pickerStyle="segmented"
            >
              <Text tag="cpu">CPU</Text>
              <Text tag="memory">内存</Text>
              <Text tag="disk">磁盘</Text>
            </Picker>
            <Trend
              history={history}
              metric={metric}
              height={130}
              muted={m.snapshot.cached}
            />
            <Text font={11} foregroundStyle={palette.muted}>
              {chartBusy
                ? '正在读取历史…'
                : historyNote ||
                  `${m.config.demo ? '演示曲线' : `最近 ${hours} 小时`} · ${history.length} 个采样 · 纵轴百分比`}
            </Text>
            {history.length ? (
              <Fact
                title="采样范围"
                value={`${timeLabel(history[0].time)} – ${timeLabel(history.at(-1)!.time)}`}
              />
            ) : null}
          </Section>
          <Section header={<Text>网络流动</Text>}>
            <HStack spacing={16}>
              <Reading title="↓ 下载" value={speed(s?.down ?? null)} />
              <Reading title="↑ 上传" value={speed(s?.up ?? null)} accent />
            </HStack>
            <Fact
              title="累计下载 / 上传"
              value={`${bytes(s?.totalDown ?? null)} / ${bytes(s?.totalUp ?? null)}`}
            />
            {n.trafficLimit !== null && n.trafficLimit > 0 ? (
              <Resource
                label={`周期流量 · ${n.trafficType}`}
                value={ratio(amount, n.trafficLimit)}
                detail={`${bytes(amount)} / ${bytes(n.trafficLimit)}`}
                large
              />
            ) : null}
            {amount === null &&
            n.trafficLimit !== null &&
            n.trafficLimit > 0 ? (
              <Text font={11} foregroundStyle={palette.muted}>
                接口未提供周期计费流量，不能用累计流量代替。
              </Text>
            ) : null}
          </Section>
          <Section header={<Text>网络探测 · 最近一小时汇总</Text>}>
            {s?.ping.length ? (
              s.ping.map((p, i) => (
                <VStack key={String(i)} alignment="leading" spacing={5}>
                  <Text
                    font={14}
                    fontWeight="semibold"
                    foregroundStyle={palette.ink}
                  >
                    {p.name}
                  </Text>
                  <Text
                    font={12}
                    foregroundStyle={palette.muted}
                  >{`最近 ${p.latest === null ? '无有效读数' : p.latest + ' ms'} · 平均 ${p.avg ?? '—'} ms · 丢包 ${p.loss ?? '—'}%`}</Text>
                </VStack>
              ))
            ) : (
              <Text font={12} foregroundStyle={palette.muted}>
                暂无探测任务汇总；旧版 REST 不提供此字段。
              </Text>
            )}
          </Section>
          <Section header={<Text>机器档案</Text>}>
            <Fact title="CPU" value={`${n.cpuName} · ${n.cores ?? '—'} 核`} />
            <Fact title="系统 / 架构" value={`${n.os} / ${n.arch}`} />
            <Fact title="内核" value={n.kernel} />
            <Fact title="虚拟化" value={n.virtualization} />
            <Fact title="到期" value={expiry(n.expires)} />
            {n.expires ? (
              <Fact
                title="到期日期"
                value={new Date(n.expires).toLocaleDateString('zh-CN')}
              />
            ) : null}
            {n.price !== null ? (
              <Fact
                title="价格 / 周期"
                value={`${n.currency}${n.price} / ${n.billing === null ? '未提供' : n.billing + ' 天'}`}
              />
            ) : null}
            <Fact title="UUID" value={n.id} />
            {n.tags ? <Text>{n.tags}</Text> : null}
            {n.remark ? <Text>{n.remark}</Text> : null}
          </Section>
        </>
      )}
    </List>
  )
}
