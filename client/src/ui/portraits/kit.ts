// What a guild's portrait kit provides (one file per kit in this folder, named like the 3D kit).
import type { JSX } from 'preact'

export const INK = '#2B2A33'

export interface PortraitKit {
  /** The working clothes, drawn inside the body outline. */
  dress: JSX.Element
  /** One per hat name in content (guild.hats), in the same order. */
  hats: JSX.Element[]
}
