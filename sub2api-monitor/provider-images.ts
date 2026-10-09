import { PROVIDER_ARTWORK } from './provider-artwork'

export type ArtworkKey = keyof typeof PROVIDER_ARTWORK
export type LoadedArtwork<T> = { images: Partial<Record<ArtworkKey, {light:T;dark:T}>>; failed: ArtworkKey[] }

/** Decode before Widget.present, which terminates the script context. No network. */
export function loadProviderArtwork<T>(fromFile:(path:string)=>T|null, fromBase64:(data:string)=>T|null, pathFor:(name:string)=>string):LoadedArtwork<T> {
  const images:LoadedArtwork<T>['images']={}, failed:ArtworkKey[]=[]
  for(const key of Object.keys(PROVIDER_ARTWORK) as ArtworkKey[]) {
    function decode(mode:'light'|'dark'):T|null {
      // Decode the bundled bytes first: independent of imported asset paths.
      try { const image=fromBase64(PROVIDER_ARTWORK[key][mode]); if(image)return image } catch {}
      // Same artwork on disk remains a compatibility fallback, never a substitute logo.
      try { return fromFile(pathFor(`${key}-${mode}.png`)) } catch { return null }
    }
    const light=decode('light'),dark=decode('dark')
    if(light&&dark)images[key]={light,dark}
    else failed.push(key)
  }
  return {images,failed}
}
