import { AppIntentManager, AppIntentProtocol, Widget, fetch } from 'scripting'
import { refreshMonitor, type RefreshSelection } from './refresh'
// App Intent is the supported widget interaction host. No app-only action closure.
export const RefreshMonitorIntent = AppIntentManager.register({
  name:'RefreshMonitorIntent',
  protocol:AppIntentProtocol.AppIntent,
  perform:async (selection:RefreshSelection) => {
    try {
      const outcome=await refreshMonitor(selection,fetch)
      if(outcome.status==='failed'||outcome.status==='discarded'||outcome.status==='ignored'&&outcome.notice)throw new Error(outcome.notice)
    }
    finally { Widget.reloadAll() }
  },
})
