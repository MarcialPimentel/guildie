// A square up the Steps: what the engine needs from one. Since 0.13.0 there is only the Palazzo (the guild
// quarters of 0.9.0 are gone); stall slots stay in the interface for squares that line crafters' bottegas.
// The walkable area and arrival point match realtime/src/room.js BOUNDS and SPAWN.
import * as THREE from 'three'
import type { PickId } from './types'

export const QUARTER_BOUNDS = { minX: -21, maxX: 21, minZ: -13, maxZ: 15 }
export const QUARTER_SPAWN = new THREE.Vector3(0, 1, 13)


export interface StallSlot {
  group: THREE.Group
  /** Where a visitor stands, and where an echo appears. */
  front: THREE.Vector3
  /** Which way the stall faces (radians, for blobs standing at it). */
  facing: number
  sign: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture }
  goods: THREE.InstancedMesh
  labelPoint: THREE.Vector3
  material: THREE.MeshStandardMaterial
}

export interface Quarter {
  root: THREE.Group
  slots: StallSlot[]
  picks: Map<PickId, THREE.Object3D[]>
  highlight: Map<PickId, THREE.MeshStandardMaterial[]>
  focusPoint(id: PickId): THREE.Vector3
  labelPoint(id: PickId): THREE.Vector3
  /** Paint a stall's sign ("" = to let). level 1-4 (0.11.0): a weathered plank for a shack, gilded for a fine bottega. */
  paintSign(slot: number, text: string, friend: boolean, level?: number): void
  /** Officials who stand in this scene (the Palazzo, 0.11.0): each is a clickable place. */
  npcSpots?: { id: PickId; character: string; at: THREE.Vector3; facing: number; hat?: number }[]
  /** Where the Factotum's statue stands (top of the plinth) and how big (0.13.0). */
  statue?: { at: THREE.Vector3; scale: number }
  /** The portrait's canvas material on the Palazzo façade (0.13.0): the engine paints the Factotum into it. */
  portrait?: THREE.MeshStandardMaterial
  dispose(): void
}
