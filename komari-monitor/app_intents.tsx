import { AppIntentManager, AppIntentProtocol, Widget } from 'scripting'
import { readConfig, refresh } from './state'
import { families, type Family } from './model'
export const RefreshKomariIntent = AppIntentManager.register({
  name: 'RefreshKomariIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (params: {
    family: Family
    parameter: string
    revision: string
  }) => {
    const c = readConfig()
    if (
      !params ||
      c.revision !== params.revision ||
      !families.includes(params.family)
    )
      return
    await refresh(
      c,
      params.family,
      typeof params.parameter === 'string' ? params.parameter : '',
    )
    Widget.reloadAll()
  },
})
