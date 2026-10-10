import { useState } from 'scripting'
import { readConfig, initialSnapshot, refresh } from './state'
/** Poll only while the page is visible; ignore responses after leaving it. */
export function useMonitor() {
  const [snapshot, setSnapshot] = useState(() => initialSnapshot(readConfig())),
    [config, setConfig] = useState(readConfig),
    [busy, setBusy] = useState(false)
  const [control] = useState(() => ({
    active: false,
    epoch: 0,
    busy: false,
    timer: undefined as number | undefined,
  }))
  async function reload() {
    if (control.busy || !control.active) return
    const epoch = control.epoch
    control.busy = true
    setBusy(true)
    const c = readConfig()
    setConfig(c)
    try {
      const result = await refresh(c)
      if (control.active && control.epoch === epoch) setSnapshot(result)
    } finally {
      if (control.epoch === epoch) {
        control.busy = false
        setBusy(false)
      }
    }
  }
  function disappear() {
    control.active = false
    control.epoch++
    control.busy = false
    if (control.timer !== undefined) clearTimeout(control.timer)
    control.timer = undefined
  }
  function appear() {
    disappear()
    control.active = true
    const epoch = control.epoch
    const tick = async () => {
      await reload()
      if (control.active && control.epoch === epoch)
        control.timer = setTimeout(tick, 30_000)
    }
    void tick()
  }
  return { snapshot, config, busy, reload, appear, disappear }
}
