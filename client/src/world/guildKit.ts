// What a guild's 3D art kit provides (one file per kit in kits/, picked by the guild's "kit" in
// content/professions.json). Everything else about a guild (names, colors, hat names) is content.
import type * as THREE from 'three'
import type { Part, Prop } from './parts'

export interface StationContext {
  /** The station's group on your quay (clickable as 'station'). */
  grp: THREE.Group
  /** The station's x position on the quay. */
  x: number
  /** Seeded random numbers, so every visit looks the same. */
  rr: (a: number, b: number) => number
  /** A white material for instanced meshes that color each instance. */
  whiteMat: THREE.MeshStandardMaterial
}

export interface WorkbenchContext {
  grp: THREE.Group
  x: number
}

export interface Workbench {
  /** A glowing material that brightens while crafting (fire, coals), if any. */
  glow: THREE.MeshStandardMaterial | null
  /** A part that moves while crafting (a flame flickers, a mallet swings), if any. */
  anim: THREE.Object3D | null
  /** The workbench light's color. */
  light: string
  /** What rises from the bench while crafting. */
  particles: 'sparks' | 'bubbles' | 'dust'
}

export interface GuildKit {
  /** The guild's working clothes on every member. */
  dress(): Part[]
  /** One per hat name in content (guild.hats), in the same order. top = head height when the hat is tall. */
  hats: { parts(): Part[]; top?: number }[]
  /** The guild trainer at the hall door. */
  trainer: { skin: string; prop: Prop; top: number; parts(): Part[] }
  /**
   * Build the gathering station. Returns one instanced mesh per station output, in content order: the number
   * of visible instances shows how full that output is (outputs without a mesh just don't show).
   */
  station(ctx: StationContext): THREE.InstancedMesh[]
  /** Height of the station's floating label. */
  stationLabelY: number
  /** Build the workbench under the lean-to roof. */
  workbench(ctx: WorkbenchContext): Workbench
}
