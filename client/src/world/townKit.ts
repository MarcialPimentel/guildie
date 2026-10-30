// The Portovela town kit (0.17.0): Italian Renaissance buildings made in Blender from code
// (tools/art/town_kit.py, art-direction.md §9.4) and loaded from models/town_kit.glb. Each piece is one
// vertex-colored mesh plus "<piece>_glass" (window panes, which the harbor lights at night). Walls painted
// magenta in the file take a plaster color per building, so one house model comes in many colors.
// If the file can't load, the harbor and the Piazza fall back to the older buildings drawn in code.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import townKitUrl from './models/town_kit.glb?url'

export type TownPieceId = 'house_a' | 'house_b' | 'house_c' | 'house_d' | 'chiesa' | 'palazzo' | 'campanile' | 'dogana' | 'guildhall'

/** Footprint widths of the houses (x), for laying out rows. */
export const HOUSE_WIDTH: Record<'house_a' | 'house_b' | 'house_c' | 'house_d', number> = { house_a: 3.6, house_b: 3.0, house_c: 4.6, house_d: 4.0 }

const pieces = new Map<string, THREE.BufferGeometry>()
let load: Promise<void> | null = null

/** Load the kit once, before building the harbor. Never fails: on an error or after 8 s the code buildings are used. */
export function preloadTownKit(): Promise<void> {
  load ??= Promise.race([
    new GLTFLoader().loadAsync(townKitUrl).then((gltf) => {
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry
        if (!m.name.endsWith('_glass')) {
          if (!g.attributes.color) return
          g.setAttribute('color', toRgb(g.attributes.color as THREE.BufferAttribute))
        } else if (g.attributes.color) g.deleteAttribute('color')
        g.computeVertexNormals()
        pieces.set(m.name, g)
      })
      if (!pieces.has('palazzo')) throw new Error('town_kit.glb is missing pieces')
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 8000)),
  ]).catch((e) => console.warn('Town kit failed to load; using the code buildings', e))
  return load
}

export const townKitReady = () => pieces.has('palazzo')

/** Vertex colors as plain float RGB (the file may store RGBA or normalized integers). */
function toRgb(a: THREE.BufferAttribute): THREE.BufferAttribute {
  const out = new Float32Array(a.count * 3)
  for (let i = 0; i < a.count; i++) {
    out[i * 3] = a.getX(i)
    out[i * 3 + 1] = a.getY(i)
    out[i * 3 + 2] = a.getZ(i)
  }
  return new THREE.BufferAttribute(out, 3)
}

/** The magenta mark for plaster walls in the file. */
const isMark = (r: number, g: number, b: number) => r > 0.99 && g < 0.01 && b > 0.99

const kitMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true })
kitMaterial.userData.flat = true

/**
 * Place a kit piece under parent at (x, y, z), turned by rotY, its plaster walls in `plaster`. The glass, if
 * any, uses glassMat. Both are ordinary meshes, so bake() merges them with the rest of the town.
 * Returns false if the kit didn't load (the caller then builds its code version).
 */
export function townPiece(
  parent: THREE.Object3D, id: TownPieceId, x: number, y: number, z: number,
  opts: { plaster?: string; rotY?: number; scale?: number; glassMat?: THREE.Material } = {},
): boolean {
  const src = pieces.get(id)
  if (!src) return false
  const geo = src.clone()
  if (opts.plaster) {
    const c = new THREE.Color(opts.plaster)
    const col = geo.attributes.color as THREE.BufferAttribute
    for (let i = 0; i < col.count; i++) if (isMark(col.getX(i), col.getY(i), col.getZ(i))) col.setXYZ(i, c.r, c.g, c.b)
  }
  const add = (g: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(g, mat)
    m.position.set(x, y, z)
    m.rotation.y = opts.rotY ?? 0
    m.scale.setScalar(opts.scale ?? 1)
    m.castShadow = true
    m.receiveShadow = true
    parent.add(m)
  }
  add(geo, kitMaterial)
  const glass = pieces.get(`${id}_glass`)
  if (glass && opts.glassMat) add(glass.clone(), opts.glassMat)
  return true
}
