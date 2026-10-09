import { Image, Script, VStack } from 'scripting'
import type { Provider } from './model'
import { loadProviderArtwork } from './provider-images'

// UIImage and Path are Scripting globals. Decode synchronously before Widget.present;
// never defer file access until after the script context has been destroyed.
export function preloadProviderIcons() {
  return loadProviderArtwork(path=>UIImage.fromFile(path), data=>UIImage.fromBase64String(data), name=>Path.join(Script.directory, `assets/${name}`))
}
export type ProviderImages = ReturnType<typeof preloadProviderIcons>['images']

/** Authentic offline artwork; never replaces a missing logo with an SF Symbol. */
export function ProviderIcon({ provider, size, images }: { provider: Provider; size: number; images: ProviderImages }) {
  const key = provider === 'anthropic' ? 'claude'
    : provider === 'openai' || provider === 'antigravity' ? provider : null
  const image=key?images[key]:null
  if (!image) return <VStack frame={{ width: size, height: size }} />
  return <Image image={image}
    resizable={true} scaleToFit={true}
    renderingMode="original" widgetAccentedRenderingMode="fullColor"
    interpolation="high" frame={{ width: size, height: size }}
  />
}
