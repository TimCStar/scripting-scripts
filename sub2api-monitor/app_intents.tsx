import { AppIntentManager, AppIntentProtocol, Widget, fetch } from 'scripting'
import { refreshMonitor, type RefreshSelection } from './refresh'
// App Intent is the supported widget interaction host. No app-only action closure.
export const RefreshMonitorIntent = AppIntentManager.register({
  name:'RefreshMonitorIntent',
  protocol:AppIntentProtocol.AppIntent,
  perform:async (selection:RefreshSelection) => {
    try { await refreshMonitor(selection,fetch) }
    finally { Widget.reloadAll() }
  },
})
