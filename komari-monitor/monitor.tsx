import { AppEvents, useState, useEffect } from 'scripting'
import { readConfig, initialSnapshot, refresh } from './state'
import { errorMessage } from './client'
/** Fast status reads, slow metadata reads. Only one request sequence per visible page. */
export function useMonitor() {
  const [snapshot, setSnapshot] = useState(() => initialSnapshot(readConfig())),
    [config, setConfig] = useState(readConfig),
    [busy, setBusy] = useState(false),
    [liveNote, setLiveNote] = useState(config.demo ? '演示数据' : '准备连接'),
    [error, setError] = useState('')
  const [control] = useState(() => ({
    visible: false,
    started: false,
    active: false,
    epoch: 0,
    busy: false,
    failures: 0,
    fullAt: 0,
    latest: snapshot,
    lifecycleError: '',
    timer: undefined as number | undefined,
    listener: undefined as
      | ((phase: 'active' | 'inactive' | 'background') => void)
      | undefined,
  }))
  async function reload(full = true) {
    if (control.busy || !control.active) return
    const epoch = control.epoch
    control.busy = true
    setBusy(true)
    try {
      const c = readConfig()
      setConfig(c)
      if (!control.latest.fetchedAt) setLiveNote('连接中…')
      const fullRead = full || Date.now() - control.fullAt >= 60_000
      const result = await refresh(c, undefined, '', !fullRead)
      if (control.active && control.epoch === epoch) {
        setSnapshot(result)
        control.latest = result
        const failed =
          !!result.cached ||
          !result.fetchedAt ||
          result.nodes.some((n) => n.error)
        control.failures = failed ? control.failures + 1 : 0
        if (fullRead && !failed) control.fullAt = Date.now()
        const cause = result.nodes.find((n) => n.error)?.error
        setError(
          failed
            ? (result.cached || !result.fetchedAt ? result.notice : cause) ||
                '未能读取节点数据，请重试'
            : control.lifecycleError,
        )
        setLiveNote(
          c.demo
            ? '演示数据'
            : failed
              ? '连接失败 · 自动重试'
              : '自动更新 · 3 秒',
        )
      }
    } catch (e) {
      if (control.active && control.epoch === epoch) {
        const message = errorMessage(e)
        control.failures++
        setError(message)
        setLiveNote('连接失败 · 自动重试')
        setSnapshot({
          ...control.latest,
          cached: !!control.latest.fetchedAt,
          notice: message,
        })
      }
    } finally {
      control.busy = false
      if (control.epoch === epoch) {
        setBusy(false)
      }
    }
  }
  function stop() {
    control.active = false
    control.epoch++
    if (control.timer !== undefined) clearTimeout(control.timer)
    control.timer = undefined
  }
  function start() {
    stop()
    control.active = true
    const epoch = control.epoch
    const tick = async () => {
      await reload(false)
      if (control.active && control.epoch === epoch)
        control.timer = setTimeout(
          tick,
          Math.min(30_000, 3000 * 2 ** Math.min(control.failures, 4)),
        )
    }
    void tick()
  }
  function scene(phase: 'active' | 'inactive' | 'background') {
    if (!control.visible) return
    if (phase === 'active') start()
    else {
      stop()
      setLiveNote('已暂停')
    }
  }
  function disappear() {
    control.visible = false
    stop()
    if (control.listener) {
      try {
        AppEvents.scenePhase.removeListener(control.listener)
      } catch {}
    }
    control.listener = undefined
  }
  function appear() {
    if (control.visible) return
    disappear()
    control.visible = true
    control.started = true
    try {
      AppEvents.scenePhase.addListener(scene)
      control.listener = scene
      control.lifecycleError = ''
    } catch {
      control.lifecycleError =
        '前后台状态监听不可用。当前页面仍可自动更新，离开页面会停止。'
      setError(control.lifecycleError)
    }
    start()
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!control.started && !readConfig().demo) {
        setLiveNote('尚未连接')
        setError('页面连接尚未启动，请点击立即重试。')
      }
    }, 8000)
    return () => {
      clearTimeout(timer)
      disappear()
    }
  }, [])
  return {
    snapshot,
    config,
    busy,
    liveNote,
    error,
    reload: () => {
      if (!control.visible) appear()
      return reload(true)
    },
    appear,
    disappear,
  }
}
