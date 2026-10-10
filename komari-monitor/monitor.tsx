import { useState } from 'scripting'
import { readConfig, initialSnapshot, refresh } from './state'
/** Fast status reads, slow metadata reads. Only one request sequence per visible page. */
export function useMonitor() {
  const [snapshot, setSnapshot] = useState(() => initialSnapshot(readConfig())),
    [config, setConfig] = useState(readConfig),
    [busy, setBusy] = useState(false),
    [liveNote, setLiveNote] = useState('连接中')
  const [control] = useState(() => ({
    visible: false,
    active: false,
    epoch: 0,
    busy: false,
    failures: 0,
    fullAt: 0,
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
    const c = readConfig()
    setConfig(c)
    try {
      const fullRead = full || Date.now() - control.fullAt >= 60_000
      const result = await refresh(c, undefined, '', !fullRead)
      if (control.active && control.epoch === epoch) {
        setSnapshot(result)
        const failed =
          !!result.cached ||
          !result.fetchedAt ||
          result.nodes.some((n) => n.error)
        control.failures = failed ? control.failures + 1 : 0
        if (fullRead && !failed) control.fullAt = Date.now()
        setLiveNote(
          c.demo
            ? '演示数据'
            : failed
              ? '连接中断 · 自动重试'
              : '自动更新 · 3 秒',
        )
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
    if (control.listener) AppEvents.scenePhase.removeListener(control.listener)
    control.listener = undefined
  }
  function appear() {
    disappear()
    control.visible = true
    control.listener = scene
    AppEvents.scenePhase.addListener(control.listener)
    start()
  }
  return {
    snapshot,
    config,
    busy,
    liveNote,
    reload: () => reload(true),
    appear,
    disappear,
  }
}
