import {
  List,
  Section,
  VStack,
  HStack,
  Text,
  Picker,
  Button,
  NavigationLink,
  Navigation,
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
  latency,
  lossLabel,
  type Node,
  type Sample,
  type ProbeHistory,
} from './model'
import {
  palette,
  StatusBadge,
  Reading,
  Resource,
  Trend,
  UpdateNote,
  TrafficMeter,
  ProbeReading,
  ConnectionIssue,
} from './ui'
import { loadHistory, loadProbes } from './state'
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
    dismiss = Navigation.useDismiss(),
    n = m.snapshot.nodes.find((n) => n.id === id),
    [hours, setHours] = useState(1),
    [metric, setMetric] = useState<'cpu' | 'memory' | 'disk' | 'up' | 'down'>(
      'cpu',
    ),
    [history, setHistory] = useState<Sample[]>(n?.history || []),
    [probes, setProbes] = useState<ProbeHistory[]>([]),
    [historyNote, setHistoryNote] = useState(''),
    [chartBusy, setChartBusy] = useState(false)
  const [control] = useState(() => ({ epoch: 0, active: false }))
  async function chart() {
    if (!n) return
    const epoch = ++control.epoch
    setChartBusy(true)
    setHistoryNote('')
    try {
      const [historyResult, probeResult] = await Promise.allSettled([
        loadHistory(m.config, n, hours, m.snapshot.transport),
        loadProbes(m.config, n, hours, m.snapshot.transport),
      ])
      const result =
        historyResult.status === 'fulfilled' ? historyResult.value : []
      if (control.active && epoch === control.epoch) {
        setHistory(result)
        setProbes(probeResult.status === 'fulfilled' ? probeResult.value : [])
        const errors = [
          historyResult.status === 'rejected'
            ? `资源历史：${errorMessage(historyResult.reason)}`
            : '',
          probeResult.status === 'rejected'
            ? `延迟历史：${errorMessage(probeResult.reason)}`
            : '',
        ].filter(Boolean)
        setHistoryNote(
          errors.length
            ? errors.join(' · ')
            : result.length
              ? ''
              : '服务器未提供历史记录（可能未启用记录）',
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
  }, [
    hours,
    n?.id,
    m.config.revision,
    Math.floor(Date.parse(m.snapshot.fetchedAt) / 60_000),
  ])
  const s = n?.status,
    amount = n ? traffic(n) : null
  return (
    <List
      listStyle="insetGroup"
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
        cancellationAction: home ? (
          <Button title="完成" action={dismiss} />
        ) : undefined,
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
      {m.error ? (
        <Section>
          <ConnectionIssue message={m.error} busy={m.busy} retry={m.reload} />
        </Section>
      ) : null}
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
              <Text
                font={10}
                foregroundStyle={m.error ? palette.red : palette.teal}
              >
                {m.liveNote}
              </Text>
              <ProbeReading node={n} />
              <TrafficMeter node={n} />
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
            {m.snapshot.notice && !m.error ? (
              <Text font={11} foregroundStyle={palette.muted}>
                {m.snapshot.notice}
              </Text>
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
            <Text font={11} foregroundStyle={palette.muted}>
              流量额度按 Agent
              累计上报值和站点计量方式计算；重置行为以服务器配置为准。
            </Text>
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
                  >{`最近有效 ${latency(p.latest)} · 平均 ${latency(p.avg)} · 丢包 ${lossLabel(p.loss)}`}</Text>
                </VStack>
              ))
            ) : (
              <Text font={12} foregroundStyle={palette.muted}>
                暂无可用探测数据，请在 Komari 后台配置 Ping / TCP / HTTP 任务。
              </Text>
            )}
          </Section>
          <Section header={<Text>延迟轨迹 · 最近 {hours} 小时</Text>}>
            {probes.length ? (
              probes.map((p, i) => (
                <VStack key={String(i)} alignment="leading" spacing={8}>
                  <Text
                    font={14}
                    fontWeight="semibold"
                    foregroundStyle={palette.ink}
                  >
                    {p.name}
                  </Text>
                  <HStack>
                    <Reading title="平均延迟" value={latency(p.avg)} />
                    <Reading
                      title="窗口丢包率"
                      value={lossLabel(p.loss)}
                      accent
                    />
                  </HStack>
                  <Trend
                    ceiling={1}
                    height={70}
                    muted={m.snapshot.cached}
                    history={p.points.map((point) => ({
                      time: point.time,
                      cpu: point.value,
                      memory: null,
                      disk: null,
                      up: null,
                      down: null,
                    }))}
                  />
                  <Text font={10} foregroundStyle={palette.muted}>
                    纵轴 ms · 断点为失败或缺失 · 峰值{' '}
                    {latency(
                      p.points.some((point) => point.value !== null)
                        ? Math.max(...p.points.map((point) => point.value ?? 0))
                        : null,
                    )}
                  </Text>
                </VStack>
              ))
            ) : (
              <Text font={11} foregroundStyle={palette.muted}>
                {chartBusy ? '正在读取探测记录…' : '暂无可用探测历史'}
              </Text>
            )}
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
          <Section header={<Text>资源与网络轨迹</Text>}>
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
                if (
                  ['cpu', 'memory', 'disk', 'up', 'down'].includes(
                    String(value),
                  )
                )
                  setMetric(value as typeof metric)
              }}
              pickerStyle="segmented"
            >
              <Text tag="cpu">CPU</Text>
              <Text tag="memory">内存</Text>
              <Text tag="disk">磁盘</Text>
              <Text tag="down">下载</Text>
              <Text tag="up">上传</Text>
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
                  `${m.config.demo ? '演示曲线' : `最近 ${hours} 小时`} · ${history.length} 个采样 · ${metric === 'up' || metric === 'down' ? '纵轴 B/s' : '纵轴百分比'}`}
            </Text>
            {history.length ? (
              <Fact
                title="采样范围"
                value={`${timeLabel(history[0].time)} – ${timeLabel(history.at(-1)!.time)}`}
              />
            ) : null}
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
