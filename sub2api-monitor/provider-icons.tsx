import { Image, Script, VStack } from 'scripting'
import type { Provider } from './model'

/** Offline brand artwork. Sources and trademark notes: assets/ATTRIBUTION.md. */
export function ProviderIcon({ provider, size }: { provider: Provider; size: number }) {
  const key = provider === 'anthropic' ? 'claude'
    : provider === 'openai' || provider === 'antigravity' ? provider : null
  // Unknown providers must not acquire a misleading brand or substitute SF Symbol.
  if (!key) return <VStack frame={{ width: size, height: size }} />
  return <Image
    filePath={{
      light: Path.join(Script.directory, `assets/${key}-light.png`),
      dark: Path.join(Script.directory, `assets/${key}-dark.png`),
    }}
    resizable={true}
    scaleToFit={true}
    renderingMode="original"
    interpolation="high"
    frame={{ width: size, height: size }}
  />
}
