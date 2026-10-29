// The character kit (docs/art-direction.md §9): every person in Portovela is the same chunky, wobbly blob,
// dressed from a table of parts (dress, hat, one prop in the hand, a rank sash). Each blob is one merged
// body mesh (vertex colors) and two hand meshes (a prop is merged into its hand), so a character costs
// 3 draw calls; the ground shadows of everyone are one shared instanced mesh (Shadows). Motion is springs
// on squash, lean and hand positions: no skeleton, no physics engine. A new character is a few lines in
// LOOKS (the hired hands of #51 are already here).
import * as THREE from 'three'
import { BODY_COLORS, SASH_COLORS } from './looks'
import type { ProfessionId } from './types'

export { BODY_COLORS, HAT_NAMES, RANK_NAMES } from './looks'

const INK = '#2B2A33'
export const BLOB_SCALE = 1.4

/**
 * Who a blob is. Players use their guild id; the rest are townsfolk, officials, the order customers
 * (content/orders.json ids), the market buyers (content/economy.json persona ids) and future hired hands.
 */
export type Character = ProfessionId
  | 'porter' | 'priest' | 'fishwife' | 'sailor' | 'herald' | `trainer:${ProfessionId}`
  | 'lady_ashworth' | 'squire_pell' | 'mother_hale' | 'foreman_grigg' | 'captain_vos' | 'brother_amon' | 'madame_orsini'
  | 'collector_quill' | 'collector_marchesa'
  | 'townsfolk' | 'adventurers' | 'workshops' | 'traders' | 'courier'
  | 'apprentice' | 'mason'

export type Emote = 'wave' | 'bow' | 'cheer' | 'shrug' | 'handover' | 'trumpet' | 'nod' | 'look' | 'rock' | 'stretch'
const EMOTE_TIME: Record<Emote, number> = { wave: 1.2, bow: 1.4, cheer: 1.3, shrug: 1.1, handover: 1.0, trumpet: 2.0, nod: 0.7, look: 2.6, rock: 2.2, stretch: 1.6 }

// ------------------------------------------------------------------ building shapes
type Part = { geo: THREE.BufferGeometry; c: string; x: number; y: number; z: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; order?: THREE.EulerOrder }
const P = (geo: THREE.BufferGeometry, c: string, x = 0, y = 0, z = 0, o: Partial<Part> = {}): Part => ({ geo, c, x, y, z, ...o })
// 0.10.1: people are smooth-shaded with 1.5x the curve segments of 0.10.0 (the town stays faceted).
// Every rounded part goes through these helpers, so SEG sets how smooth the whole cast is.
const SEG = 1.5
const seg = (n: number, k = SEG) => Math.max(3, Math.round(n * k))
const sph = (r: number, w = 8, h = 6, ...a: number[]) => new THREE.SphereGeometry(r, seg(w), seg(h), ...a)
const cyl = (rt: number, rb: number, h: number, s = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg(s, 1.6), 1, open)
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const cone = (r: number, h: number, s = 8) => new THREE.ConeGeometry(r, h, seg(s, 1.6))
const tor = (r: number, t: number, rs = 3, ts = 12, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, seg(rs), seg(ts), arc)
const dome = (r: number, w = 8, h = 3) => new THREE.SphereGeometry(r, seg(w), seg(h), 0, Math.PI * 2, 0, Math.PI / 2)
const capsule = (r: number, l: number, c = 2, s = 6) => new THREE.CapsuleGeometry(r, l, seg(c), seg(s))

/** Paint each part one color, move it into place and merge them into one geometry. */
function merge(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()
    p.geo.dispose()
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, p.order ?? 'XYZ'))
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1)))
    return [g, new THREE.Color(p.c)] as const
  })
  let n = 0
  for (const [g] of geos) n += g.attributes.position.count
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3)
  let o = 0
  for (const [g, c] of geos) {
    const m = g.attributes.position.count
    pos.set(g.attributes.position.array as Float32Array, o * 3)
    nor.set(g.attributes.normal.array as Float32Array, o * 3)
    for (let i = 0; i < m; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b }
    o += m
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  out.computeBoundingSphere()
  return out
}

// the shared blob: body, feet, eyes and blush (about 300 triangles; flat shading hides the low count)
const base = (skin: string): Part[] => [
  P(new THREE.CapsuleGeometry(0.5, 0.42, 5, 20), skin, 0, 0.72, 0),   // the main silhouette: extra round
  P(sph(0.17, 6, 3), '#5A3A28', -0.22, 0.05, 0.1, { sy: 0.55, sz: 1.3 }),
  P(sph(0.17, 6, 3), '#5A3A28', 0.22, 0.05, 0.1, { sy: 0.55, sz: 1.3 }),
  P(sph(0.065, 4, 3), INK, -0.16, 1.06, 0.45),
  P(sph(0.065, 4, 3), INK, 0.16, 1.06, 0.45),
  P(sph(0.08, 4, 2), '#E98A86', -0.3, 0.93, 0.39, { sz: 0.4 }),
  P(sph(0.08, 4, 2), '#E98A86', 0.3, 0.93, 0.39, { sz: 0.4 }),
]
const robe = (c: string, top: number, h: number, flare = 0.58) => P(cyl(0.51, flare, h, 11, true), c, 0, top - h / 2, 0)
const band = (c: string, y: number, r = 0.54) => P(cyl(r, r, 0.08, 11, true), c, 0, y, 0)
const apron = (c: string) => [P(box(0.62, 0.66, 0.08), c, 0, 0.55, 0.47, { rx: -0.08 }), P(box(0.06, 0.4, 0.06), c, -0.24, 0.98, 0.42, { rx: -0.3 }), P(box(0.06, 0.4, 0.06), c, 0.24, 0.98, 0.42, { rx: -0.3 })]
const beard = () => P(sph(0.34, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#F5F2EA', 0, 0.98, 0.26, { sz: 0.75 })
const chain = () => [P(tor(0.46, 0.035, 3, 14), '#E3B54A', 0, 0.98, 0.02, { rx: Math.PI / 2 + 0.25 }), P(sph(0.09, 6, 4), '#E3B54A', 0, 0.86, 0.5)]

/** A sash across the body for each rank (#30): none for Apprentice, then sea-glass, majolica, lemon gold. */
const sash = (rank: number): Part[] => {
  const c = SASH_COLORS[rank]
  if (!c) return []
  const out = [P(tor(0.535, 0.06, 3, 13), c, 0, 0.78, 0, { rx: Math.PI / 2, rz: 0.62, order: 'ZXY' })]
  if (rank >= 3) out.push(P(sph(0.09, 6, 4), '#C79A3A', 0.2, 0.62, 0.5))
  return out
}

const HATS: Record<ProfessionId, (() => Part[])[]> = {
  blacksmith: [
    () => [P(cyl(0.33, 0.38, 0.24, 10), '#B83A3A', 0.02, 1.43, -0.02, { rz: 0.12 }), P(dome(0.33, 9, 3), '#B83A3A', 0.04, 1.53, -0.02, { sy: 0.55 })],
    () => [P(dome(0.5, 9, 3), '#5A3A28', 0, 1.12, -0.03, { sy: 0.78 }), P(box(0.7, 0.08, 0.12), '#7A5233', 0, 1.2, 0.43, { rx: -0.25 })],
    () => [P(dome(0.47, 9, 3), '#B83A3A', 0, 1.2, -0.02, { sy: 0.6 }), P(sph(0.11, 6, 4), '#B83A3A', 0, 1.25, -0.5), P(cone(0.08, 0.3, 5), '#B83A3A', 0.08, 1.1, -0.55, { rz: 0.5 })],
  ],
  alchemist: [
    () => [P(cone(0.4, 0.8, 9), '#2A4C9A', 0, 1.73, -0.03, { rz: -0.08 }), P(cyl(0.46, 0.46, 0.06, 11), '#2A4C9A', 0, 1.36, 0), P(sph(0.09, 6, 4), '#F2C53D', 0.08, 2.12, -0.05)],
    () => [P(cyl(0.36, 0.36, 0.16, 10), '#2A4C9A', 0, 1.42, 0), P(sph(0.4, 9, 5), '#2A4C9A', 0, 1.56, -0.03, { sy: 0.45 }), P(sph(0.07, 6, 4), '#F2C53D', 0, 1.74, -0.03)],
    () => [P(dome(0.53, 9, 3), '#1F8A87', 0, 1.1, -0.06, { sy: 0.85 }), P(cone(0.12, 0.42, 6), '#1F8A87', 0, 1.25, -0.6, { rx: -1.9 }), P(sph(0.07, 6, 4), '#F2C53D', 0, 1.1, -0.82)],
  ],
  leatherworker: [
    () => [P(cyl(0.66, 0.66, 0.05, 13), '#E3C27A', 0, 1.38, 0), P(cyl(0.3, 0.34, 0.26, 11), '#E3C27A', 0, 1.52, 0), P(cyl(0.345, 0.345, 0.07, 11), '#A9492A', 0, 1.44, 0)],
    () => [P(sph(0.4, 9, 4), '#4E6F2C', 0.06, 1.42, 0, { sy: 0.35 }), P(cone(0.05, 0.75, 5), '#F3D27A', 0.3, 1.66, -0.08, { rz: -0.75 })],
    () => [P(dome(0.45, 9, 3), '#A9492A', 0, 1.24, -0.02, { sy: 0.55 }), P(box(0.36, 0.03, 0.2), '#A9492A', 0, 1.27, 0.42)],
  ],
}
const DRESS: Record<ProfessionId, () => Part[]> = {
  blacksmith: () => apron('#4B3A2E'),
  alchemist: () => [robe('#1F8A87', 0.75, 0.7)],
  leatherworker: () => [robe('#4E6F2C', 0.95, 0.75)],
}

/** Props held in the right hand (positions relative to the hand). */
export type Prop = 'oar' | 'fan' | 'loaf' | 'mallet' | 'spyglass' | 'jar' | 'basket' | 'magnifier' | 'parasol' | 'fish' | 'sack' | 'crate' | 'purse' | 'trumpet' | 'hammer' | 'note' | 'scroll'
const PROPS: Record<Prop, () => Part[]> = {
  oar: () => [P(cyl(0.04, 0.04, 2.1, 5), '#8F4E2B', 0, 0.4, -0.05, { rz: 0.12 }), P(box(0.2, 0.55, 0.04), '#B5683A', -0.14, 1.35, -0.05, { rz: 0.12 })],
  fan: () => [P(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 8, 1, false, 0, Math.PI), '#F6C9D8', 0, 0.14, 0.05, { rx: Math.PI / 2 })],
  loaf: () => [P(capsule(0.11, 0.22), '#C98A4A', 0, 0.02, 0.12, { rz: Math.PI / 2 })],
  mallet: () => [P(cyl(0.03, 0.03, 0.55, 5), '#8F4E2B', 0, 0.2, 0.05), P(box(0.3, 0.16, 0.16), '#7A5233', 0, 0.48, 0.05)],
  spyglass: () => [P(cyl(0.05, 0.07, 0.55, 7), '#C79A3A', 0, 0.12, 0.12, { rx: 1.2 })],
  jar: () => [P(cyl(0.11, 0.12, 0.22, 7), '#2FB59D', 0, 0.02, 0.12), P(cyl(0.08, 0.08, 0.06, 7), '#F6EEDC', 0, 0.16, 0.12)],
  basket: () => [P(sph(0.22, 8, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#B5833E', 0, -0.12, 0.05), P(tor(0.17, 0.025, 3, 8, Math.PI), '#8F6A35', 0, -0.12, 0.05), P(sph(0.1, 5, 3), '#EFA9A0', 0.06, -0.1, 0.07)],
  magnifier: () => [P(tor(0.12, 0.03, 3, 10), '#C79A3A', 0, 0.3, 0.12), P(cyl(0.1, 0.1, 0.01, 10), '#BFE3F0', 0, 0.3, 0.12, { rx: Math.PI / 2 }), P(cyl(0.025, 0.025, 0.25, 5), '#5A3A28', 0, 0.08, 0.12)],
  parasol: () => [P(cyl(0.025, 0.025, 1.7, 5), '#5A3A28', 0, 0.75, 0), P(cone(0.75, 0.32, 10), '#F6EEDC', 0, 1.65, 0), P(sph(0.06, 5, 3), '#F2C53D', 0, 1.83, 0)],
  fish: () => [P(capsule(0.08, 0.3), '#7FA3B5', 0, -0.05, 0.1, { rz: 0.3 }), P(cone(0.1, 0.14, 4), '#7FA3B5', 0.13, -0.25, 0.1, { rz: 0.3 + Math.PI })],
  sack: () => [P(sph(0.26, 7, 5), '#C9A877', 0, 0.12, 0.15, { sy: 1.15 }), P(cyl(0.07, 0.1, 0.12, 6), '#A9875A', 0, 0.42, 0.15)],
  crate: () => [P(box(0.42, 0.34, 0.34), '#B5833E', -0.25, 0.05, 0.22), P(box(0.44, 0.05, 0.36), '#8F6A35', -0.25, 0.2, 0.22)],
  purse: () => [P(sph(0.12, 6, 4), '#7A2E3A', 0, -0.12, 0.08), P(cyl(0.05, 0.03, 0.08, 5), '#F2C53D', 0, 0.0, 0.08)],
  trumpet: () => [P(cyl(0.025, 0.025, 0.8, 5), '#E3B54A', 0, 0.35, 0.1), P(cone(0.12, 0.2, 7), '#E3B54A', 0, 0.82, 0.1, { rx: Math.PI }), P(box(0.3, 0.32, 0.02), '#2A4C9A', 0.16, 0.36, 0.1), P(box(0.12, 0.12, 0.025), '#F2C53D', 0.16, 0.36, 0.11)],
  hammer: () => [P(cyl(0.03, 0.03, 0.5, 5), '#8F4E2B', 0, 0.2, 0.05), P(box(0.26, 0.12, 0.12), '#C79A3A', 0, 0.45, 0.05)],
  note: () => [P(box(0.28, 0.2, 0.03), '#F6EEDC', 0, 0.05, 0.14), P(cyl(0.05, 0.05, 0.03, 6), '#B83A3A', 0, 0.05, 0.16, { rx: Math.PI / 2 })],
  scroll: () => [P(cyl(0.06, 0.06, 0.4, 6), '#F6EEDC', 0, 0.1, 0.12, { rz: Math.PI / 2 }), P(cyl(0.065, 0.065, 0.06, 6), '#B83A3A', 0, 0.1, 0.12, { rz: Math.PI / 2 })],
}

interface LookDef { skin: string; prop?: Prop; loop?: 'carry' | 'hammer'; top?: number; parts: () => Part[] }
const trainerParts: Record<ProfessionId, () => Part[]> = {
  blacksmith: () => [robe('#4B3A2E', 1.0, 1.0, 0.62), ...apron('#6B4A35'), beard(), ...chain(), P(cyl(0.34, 0.4, 0.42, 10), '#B83A3A', 0.02, 1.58, -0.02, { rz: 0.1 }), P(dome(0.35, 9, 3), '#B83A3A', 0.04, 1.77, -0.02, { sy: 0.5 })],
  alchemist: () => [robe('#1F8A87', 1.0, 1.0, 0.64), beard(), ...chain(), P(cone(0.46, 1.0, 9), '#2A4C9A', 0, 1.86, -0.03, { rz: -0.1 }), P(cyl(0.52, 0.52, 0.06, 11), '#2A4C9A', 0, 1.37, 0), P(sph(0.1, 6, 4), '#F2C53D', 0.1, 2.36, -0.05)],
  leatherworker: () => [robe('#4E6F2C', 1.0, 1.0, 0.64), beard(), ...chain(), P(cyl(0.74, 0.74, 0.05, 13), '#E3C27A', 0, 1.38, 0), P(cyl(0.32, 0.36, 0.34, 11), '#E3C27A', 0, 1.56, 0), P(cyl(0.365, 0.365, 0.08, 11), '#A9492A', 0, 1.46, 0), P(cone(0.05, 0.75, 5), '#F6EEDC', 0.32, 1.78, -0.1, { rz: -0.6 })],
}
const striped = (): Part[] => [robe('#F5F0E4', 0.95, 0.7), band('#2A4C9A', 0.78, 0.535), band('#2A4C9A', 0.56, 0.555)]
const LOOKS: Record<Exclude<Character, ProfessionId>, LookDef> = {
  // the town and its officials
  porter: { skin: '#F6C9A2', prop: 'sack', parts: () => [robe('#F5F0E4', 0.85, 0.7), P(dome(0.42, 9, 3), '#C4623A', 0, 1.22, -0.02, { sy: 0.7 })] },
  priest: { skin: '#E9D5F0', parts: () => [robe('#2B2A33', 1.0, 1.0), P(box(0.12, 0.12, 0.04), '#F5F0E4', 0, 0.98, 0.5), P(cyl(0.3, 0.3, 0.12, 10), '#2B2A33', 0, 1.42, 0), P(cyl(0.5, 0.5, 0.04, 13), '#2B2A33', 0, 1.37, 0)] },
  fishwife: { skin: '#EFA9A0', prop: 'fish', parts: () => [robe('#2A4C9A', 0.8, 0.65), P(box(0.55, 0.5, 0.06), '#F6EEDC', 0, 0.5, 0.5), P(dome(0.44, 9, 3), '#F2C53D', 0, 1.2, -0.03, { sy: 0.75 })] },
  sailor: { skin: '#F2B98B', parts: () => [...striped(), P(dome(0.4, 9, 3), '#2A4C9A', 0, 1.25, -0.02, { sy: 0.55 }), P(cyl(0.41, 0.41, 0.07, 11), '#1E3557', 0, 1.27, -0.02)] },
  herald: { skin: '#BFE3D9', prop: 'trumpet', parts: () => [robe('#2A4C9A', 0.95, 0.8), P(box(0.5, 0.75, 0.06), '#F2C53D', 0, 0.62, 0.5), P(box(0.18, 0.18, 0.07), '#2A4C9A', 0, 0.7, 0.53), P(cyl(0.38, 0.4, 0.2, 11), '#A9492A', 0, 1.42, 0, { rz: -0.1 }), P(cone(0.06, 0.7, 5), '#F6EEDC', 0.28, 1.85, -0.1, { rz: -0.5 })] },
  'trainer:blacksmith': { skin: '#F6C9A2', prop: 'hammer', top: 2.05, parts: trainerParts.blacksmith },
  'trainer:alchemist': { skin: '#E9D5F0', prop: 'jar', top: 2.5, parts: trainerParts.alchemist },
  'trainer:leatherworker': { skin: '#F3D27A', prop: 'scroll', top: 2.0, parts: trainerParts.leatherworker },
  // the order customers (content/orders.json)
  lady_ashworth: { skin: '#F6C9A2', prop: 'fan', parts: () => [robe('#A57BC4', 0.95, 0.95, 0.72), P(tor(0.36, 0.16, 4, 12), '#D4A23A', 0, 1.42, 0, { rx: Math.PI / 2 }), P(sph(0.3, 9, 5), '#D4A23A', 0, 1.5, 0, { sy: 0.6 }), P(sph(0.05, 5, 3), '#F6EEDC', 0, 0.98, 0.5)] },
  squire_pell: { skin: '#F2B98B', prop: 'oar', top: 2.2, parts: () => [...striped(), P(cone(0.32, 0.6, 8), '#B83A3A', 0.12, 1.55, -0.08, { rz: -0.75 }), P(sph(0.07, 5, 3), '#F6EEDC', 0.42, 1.68, -0.08)] },
  mother_hale: { skin: '#F6C9A2', prop: 'loaf', parts: () => [robe('#6B6F7A', 1.0, 1.0, 0.62), P(dome(0.55, 9, 3), '#2B2A33', 0, 1.08, -0.06, { sy: 0.85 }), P(box(0.7, 0.1, 0.1), '#F5F0E4', 0, 1.2, 0.43, { rx: -0.3 }), P(box(0.46, 0.12, 0.1), '#F5F0E4', 0, 0.86, 0.48)] },
  foreman_grigg: { skin: '#EFA9A0', prop: 'mallet', parts: () => [robe('#5E6E7E', 0.9, 0.7), P(box(0.5, 0.42, 0.05), '#C4A882', 0, 0.48, 0.55), P(cyl(0.37, 0.4, 0.1, 10), '#7E8790', 0, 1.42, 0), P(box(0.34, 0.03, 0.22), '#7E8790', 0, 1.39, 0.4)] },
  captain_vos: { skin: '#F3D27A', prop: 'spyglass', parts: () => [robe('#1E3557', 0.98, 0.95, 0.64), P(sph(0.05, 5, 3), '#E3B54A', 0, 0.85, 0.53), P(sph(0.05, 5, 3), '#E3B54A', 0, 0.68, 0.55), P(sph(0.05, 5, 3), '#E3B54A', 0, 0.51, 0.57), P(cyl(0.64, 0.64, 0.05, 13), '#22252E', 0, 1.4, 0), P(cyl(0.3, 0.33, 0.3, 10), '#22252E', 0, 1.56, 0), P(cone(0.08, 0.75, 5), '#B83A3A', 0.32, 1.72, -0.08, { rz: -1.1 })] },
  brother_amon: { skin: '#F6C9A2', prop: 'jar', parts: () => [robe('#7A5233', 1.0, 1.0, 0.62), P(tor(0.535, 0.04, 3, 13), '#E8D9B5', 0, 0.74, 0, { rx: Math.PI / 2 }), P(sph(0.3, 7, 5), '#7A5233', 0, 1.0, -0.42, { sy: 0.8 }), P(tor(0.33, 0.07, 3, 12), '#5A3A28', 0, 1.33, -0.02, { rx: Math.PI / 2 })] },
  madame_orsini: { skin: '#E9D5F0', prop: 'basket', parts: () => [robe('#3E7D5A', 0.9, 0.85, 0.66), P(box(0.5, 0.45, 0.05), '#F6EEDC', 0, 0.5, 0.56), P(dome(0.45, 9, 3), '#E06C52', 0, 1.18, -0.03, { sy: 0.78 })] },
  collector_quill: { skin: '#BFE3D9', prop: 'magnifier', top: 2.05, parts: () => [robe('#2B2A33', 0.95, 0.85), P(tor(0.5, 0.1, 4, 14), '#F7F3EA', 0, 0.9, 0, { rx: Math.PI / 2 }), P(sph(0.4, 9, 4), '#2B2A33', 0.08, 1.42, 0, { sy: 0.35 }), P(cone(0.06, 0.95, 5), '#F7F3EA', 0.3, 1.78, -0.1, { rz: -0.55 })] },
  collector_marchesa: { skin: '#F6C9A2', prop: 'parasol', top: 2.2, parts: () => [robe('#A3263A', 0.95, 0.95, 0.74), P(box(0.3, 0.6, 0.05), '#F2C53D', 0, 0.5, 0.6, { rx: -0.1 }), P(cyl(0.3, 0.32, 0.09, 10), '#E3B54A', 0, 1.4, 0), P(sph(0.06, 5, 3), '#E3B54A', 0, 1.5, 0.27), P(sph(0.05, 5, 3), '#E3B54A', 0.2, 1.48, 0.2), P(sph(0.05, 5, 3), '#E3B54A', -0.2, 1.48, 0.2), P(sph(0.05, 5, 3), '#F6EEDC', 0, 0.98, 0.5)] },
  // market buyers (content/economy.json personas) and a porter for sales to other players
  townsfolk: { skin: '#F3D27A', prop: 'basket', parts: () => [robe('#E8D9B5', 0.85, 0.7), P(cyl(0.48, 0.48, 0.04, 12), '#E3C27A', 0, 1.36, 0), P(cyl(0.26, 0.3, 0.18, 10), '#E3C27A', 0, 1.46, 0)] },
  adventurers: { skin: '#F2B98B', parts: () => [...striped(), P(dome(0.4, 9, 3), '#2A4C9A', 0, 1.25, -0.02, { sy: 0.55 }), P(cyl(0.41, 0.41, 0.07, 11), '#1E3557', 0, 1.27, -0.02)] },
  workshops: { skin: '#EFA9A0', prop: 'crate', parts: () => [robe('#B5833E', 0.85, 0.7), ...apron('#5A3A28'), P(cyl(0.37, 0.4, 0.1, 10), '#8F6A35', 0, 1.42, 0), P(box(0.34, 0.03, 0.22), '#8F6A35', 0, 1.39, 0.4)] },
  traders: { skin: '#F2B98B', prop: 'purse', parts: () => [robe('#D9902F', 1.0, 1.0, 0.64), P(tor(0.535, 0.05, 3, 13), '#7A2E3A', 0, 0.7, 0, { rx: Math.PI / 2 }), P(tor(0.33, 0.13, 4, 12), '#F7F3EA', 0, 1.42, 0, { rx: Math.PI / 2 }), P(sph(0.28, 8, 5), '#F7F3EA', 0, 1.52, 0, { sy: 0.7 }), P(sph(0.06, 5, 3), '#2FB59D', 0, 1.46, 0.42)] },
  courier: { skin: '#F6C9A2', prop: 'note', parts: () => [robe('#F5F0E4', 0.85, 0.7), P(dome(0.42, 9, 3), '#2A4C9A', 0, 1.22, -0.02, { sy: 0.7 })] },
  // hired hands (#51 workshop upgrades)
  apprentice: { skin: '#F6C9A2', prop: 'sack', loop: 'carry', parts: () => [robe('#EDE3CC', 0.8, 0.6), P(dome(0.36, 9, 3), '#B83A3A', 0, 1.3, -0.02, { sy: 0.6 })] },
  mason: { skin: '#F3D27A', prop: 'mallet', loop: 'hammer', parts: () => [robe('#8A8F96', 0.85, 0.7), P(dome(0.44, 9, 3), '#F5F0E4', 0, 1.2, -0.02, { sy: 0.6 })] },
}
const isGuild = (c: Character): c is ProfessionId => c === 'blacksmith' || c === 'alchemist' || c === 'leatherworker'
/** Is there a look for this character? (Customer ids from the server may be new.) */
export const knownCharacter = (c: string): c is Character => isGuild(c as Character) || c in LOOKS

export interface BlobOptions {
  character: Character
  /** Body color (players): an index into BODY_COLORS. */
  look?: number
  /** Hat (players): 0-2, see HAT_NAMES. */
  hat?: number
  /** Rank (players): 0 Apprentice .. 3 Master, shown as a sash. */
  rank?: number
  ghost?: boolean
  me?: boolean
}

const mod = (n: number, m: number) => ((n % m) + m) % m
const skinOf = (o: BlobOptions) => (isGuild(o.character) ? BODY_COLORS[mod(o.look ?? 0, BODY_COLORS.length)] : LOOKS[o.character].skin)
const propOf = (o: BlobOptions): Prop | undefined => (isGuild(o.character) ? undefined : LOOKS[o.character].prop)

const geoCache = new Map<string, THREE.BufferGeometry>()
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key)
  if (!g) { g = make(); geoCache.set(key, g) }
  return g
}
function bodyGeometry(o: BlobOptions): THREE.BufferGeometry {
  const skin = skinOf(o)
  if (isGuild(o.character)) {
    const g = o.character
    const hat = mod(o.hat ?? 0, 3), rank = THREE.MathUtils.clamp(o.rank ?? 0, 0, 3)
    return cached(`${g}|${skin}|${hat}|${rank}`, () => merge([...base(skin), ...DRESS[g](), ...HATS[g][hat](), ...sash(rank)]))
  }
  const def = LOOKS[o.character]
  return cached(o.character, () => merge([...base(skin), ...def.parts()]))
}
function handGeometry(skin: string, prop?: Prop): THREE.BufferGeometry {
  return cached(`hand|${skin}|${prop ?? ''}`, () => merge([P(sph(0.16, 6, 4), skin), ...(prop ? PROPS[prop]() : [])]))
}

let gloveGeo: THREE.BufferGeometry | null = null
function gloveGeometry(): THREE.BufferGeometry {
  if (gloveGeo) return gloveGeo
  const W = '#F7F3EA'
  const finger = (x: number, len: number, rz = 0) => P(capsule(0.1, len, 2, 6), W, x, 0.42 + len / 2, 0, { rz })
  gloveGeo = merge([
    P(sph(0.34, 10, 7), W, 0, 0.22, 0, { sy: 0.95, sz: 0.55 }),
    finger(-0.21, 0.24, 0.12), finger(-0.07, 0.3), finger(0.07, 0.3), finger(0.21, 0.24, -0.12),
    P(capsule(0.1, 0.22, 2, 6), W, 0.36, 0.16, 0.04, { rz: -0.9 }),
    P(cyl(0.28, 0.32, 0.22, 10), '#F2C53D', 0, -0.12, 0),
    P(box(0.42, 0.03, 0.04), '#C9BFA8', 0, 0.18, 0.19),
  ])
  return gloveGeo
}

/** A parcel handed over (filled orders, sales): a sack, a jar or a bundle by item type. */
export function parcelGeometry(kind: 'sack' | 'jar' | 'crate'): THREE.BufferGeometry {
  return cached(`parcel|${kind}`, () => merge(PROPS[kind]()))
}

const opaque = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })
const ghostMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, transparent: true, opacity: 0.42, depthWrite: false })
export const blobMaterial = opaque
const ringMat = new THREE.MeshBasicMaterial({ color: '#F2C53D', transparent: true, opacity: 0.85, depthWrite: false })
const ringGeo = new THREE.RingGeometry(0.62, 0.78, 26)
ringGeo.rotateX(-Math.PI / 2)
const flagMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', side: THREE.DoubleSide, flatShading: true })

const hitGeo = new THREE.CylinderGeometry(0.8, 0.8, 1, 10)
hitGeo.translate(0, 0.5, 0)
const hitMat = new THREE.MeshBasicMaterial({ visible: false })
const HAND_REST: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-0.6, 0.62, 0.08), new THREE.Vector3(0.6, 0.62, 0.08)]
const L = new THREE.Vector3(), R = new THREE.Vector3(), V = new THREE.Vector3()

/** One person. Move `root` yourself; call update() every frame with how fast it is walking. */
export class Blob {
  readonly root = new THREE.Group()
  private wob = new THREE.Group()
  private body: THREE.Mesh
  private hands: [THREE.Mesh, THREE.Mesh]
  private flag: THREE.Mesh
  private sq = 0
  private sqV = 0
  private lean = 0
  private leanV = 0
  private phase = Math.random() * 6
  private emote: { name: Emote; t: number; dur: number } | null = null
  private still = Math.random() * 3
  private idleIn = 4 + Math.random() * 5
  private wasMoving = false
  /** Plays look-around, rocking and stretching when standing still (not for your own merchant). */
  idles = true
  /** Hat height, for labels. */
  top: number

  constructor(readonly opts: BlobOptions) {
    const mat = opts.ghost ? ghostMat : opaque
    this.body = new THREE.Mesh(bodyGeometry(opts), mat)
    this.body.receiveShadow = !opts.ghost
    const skin = skinOf(opts)
    this.hands = [new THREE.Mesh(handGeometry(skin), mat), new THREE.Mesh(handGeometry(skin, propOf(opts)), mat)]
    this.hands.forEach((h, i) => h.position.copy(HAND_REST[i]))
    this.wob.add(this.body, ...this.hands)
    this.root.add(this.wob)
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), flagMat)
    this.flag.position.set(-0.25, 1.95, 0)
    this.flag.visible = false
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), flagMat)
    pole.position.set(0.14, -0.15, 0)
    this.flag.add(pole)
    this.wob.add(this.flag)
    if (opts.me) {
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.position.y = 0.03
      ring.renderOrder = 1
      this.root.add(ring)
      this.idles = false
    }
    this.root.scale.setScalar(BLOB_SCALE)
    this.top = this.topOf()
    // An invisible column around the whole person (hat and hands too), so people are easy to point at.
    const hit = new THREE.Mesh(hitGeo, hitMat)
    hit.scale.y = this.top / BLOB_SCALE + 0.15
    hit.userData.hitBox = true
    this.root.add(hit)
  }

  private topOf(): number {
    const c = this.opts.character
    if (isGuild(c)) return (c === 'alchemist' && (this.opts.hat ?? 0) === 0 ? 2.3 : 1.9) * BLOB_SCALE
    return (LOOKS[c].top ?? 1.9) * BLOB_SCALE
  }

  /** Change a player's color, hat or rank (a cached body; no new draw calls). */
  setLook(look: number, hat: number, rank: number): void {
    Object.assign(this.opts, { look, hat, rank })
    this.body.geometry = bodyGeometry(this.opts)
    const skin = skinOf(this.opts)
    this.hands[0].geometry = handGeometry(skin)
    this.hands[1].geometry = handGeometry(skin, propOf(this.opts))
    this.top = this.topOf()
  }

  /** Is this a ghost (an echo)? Ghosts cast no shadow disc. */
  get ghost(): boolean {
    return !!this.opts.ghost
  }

  /** A move is playing (keeps the engine drawing). */
  get busy(): boolean {
    return !!this.emote && !['look', 'rock', 'stretch'].includes(this.emote.name)
  }

  /** A white flag on the hat: this merchant has slaps off. */
  setSlapsOff(off: boolean): void {
    this.flag.visible = off
  }

  /** Play a move; returns its length in seconds. */
  play(name: Emote): number {
    this.emote = { name, t: 0, dur: EMOTE_TIME[name] }
    this.still = 0
    if (name === 'cheer') this.sqV -= 2
    return EMOTE_TIME[name]
  }

  wave(): void {
    this.play('wave')
  }

  /** Squash sideways and wobble (the slide back is done by whoever moves root). */
  slapped(): void {
    this.sqV += 7
    this.leanV += 9
  }

  /** A little bounce (arriving, landing). */
  bounce(k = 3): void {
    this.sqV -= k
  }

  /** Animate: speed is how fast root moved this frame (m/s). calm = reduced motion (held poses, no wobble). */
  update(dt: number, speed: number, calm: boolean): void {
    const moving = speed > 0.2
    if (this.wasMoving && !moving && !calm) this.bounce(2.5)
    this.wasMoving = moving
    const loop = isGuild(this.opts.character) ? undefined : LOOKS[this.opts.character].loop

    // idle: after a while standing still, look around, rock or stretch
    if (!moving && !this.emote && !loop) {
      this.still += dt
      if (!calm && this.idles && this.still > this.idleIn) {
        this.play((['look', 'rock', 'stretch', 'look'] as Emote[])[Math.floor(Math.random() * 4)])
        this.idleIn = 5 + Math.random() * 4
      }
    } else if (moving) {
      this.still = 0
      if (this.emote && ['look', 'rock', 'stretch'].includes(this.emote.name)) this.emote = null
    }

    L.copy(HAND_REST[0])
    R.copy(HAND_REST[1])
    let tiltX = moving && !calm ? 0.14 : 0, tiltZ = 0, yaw = 0, hop = 0, squashY = 0
    if (moving && !calm) {
      this.phase += dt * Math.min(16, 6 + speed * 2.2)
      const swing = Math.sin(this.phase) * 0.22
      L.z += swing
      R.z -= swing
    }
    if (loop === 'carry') { L.set(-0.32, 0.95, 0.42); R.set(0.32, 0.95, 0.42) }
    if (loop === 'hammer') {
      this.phase += dt * 3.2
      R.set(0.5, 0.95 + Math.abs(Math.sin(this.phase)) * 0.5, 0.35)
      tiltX = 0.12
    }
    if (this.emote) {
      const e = this.emote
      e.t += dt
      const k = Math.min(1, e.t / e.dur)
      const env = calm ? 1 : Math.min(1, k / 0.22, (1 - k) / 0.22)
      switch (e.name) {
        case 'wave': R.set(0.55 + (calm ? 0 : Math.sin(e.t * 18) * 0.12), 1.45, 0.15); break
        case 'bow': tiltX = 0.55 * env; L.set(-0.18, 0.78, 0.5); R.lerp(V.set(0.72, 0.45, -0.35), env); break
        case 'cheer':
          L.set(-0.5, 1.55 + (calm ? 0 : Math.sin(e.t * 16) * 0.06), 0.1)
          R.set(0.5, 1.55 + (calm ? 0 : Math.cos(e.t * 16) * 0.06), 0.1)
          if (!calm) hop = Math.abs(Math.sin(k * Math.PI * 2)) * 0.32 * env
          break
        case 'shrug': L.lerp(V.set(-0.78, 0.85, 0.3), env); R.lerp(V.set(0.78, 0.85, 0.3), env); tiltZ = 0.12 * env; squashY = 0.05 * env; break
        case 'handover': L.lerp(V.set(-0.26, 0.9, 0.62), env); R.lerp(V.set(0.26, 0.9, 0.62), env); tiltX = 0.12 * env; break
        case 'trumpet': R.lerp(V.set(0.3, 1.15, 0.55), env); tiltX = -0.12 * env; break
        case 'nod': tiltX = calm ? 0.15 : Math.abs(Math.sin(k * Math.PI * 2)) * 0.22; break
        case 'look': yaw = calm ? 0 : Math.sin(k * Math.PI * 2) * 0.45; break
        case 'rock': tiltX = calm ? 0 : Math.sin(k * Math.PI * 3) * 0.07; break
        case 'stretch': L.lerp(V.set(-0.42, 1.5, 0), env); R.lerp(V.set(0.42, 1.5, 0), env); squashY = -0.05 * env; break
      }
      if (e.t >= e.dur) { this.emote = null; this.still = 0 }
    }
    if (calm) {
      this.sq = this.sqV = this.lean = this.leanV = 0
      this.wob.scale.set(1, 1 - squashY, 1)
      this.wob.position.y = 0
    } else {
      // springs: squash (scale) and lean (tilt)
      this.sqV += (-60 * this.sq - 7 * this.sqV) * dt
      this.sq += this.sqV * dt
      this.leanV += (-40 * this.lean - 6 * this.leanV) * dt
      this.lean += this.leanV * dt
      const bob = moving ? Math.abs(Math.sin(this.phase)) * 0.08 : 0
      const s = THREE.MathUtils.clamp(this.sq + (moving ? Math.sin(this.phase * 2) * 0.03 : 0) + squashY, -0.3, 0.3)
      this.wob.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5)
      this.wob.position.y = bob + hop
      tiltZ += THREE.MathUtils.clamp(this.lean * 0.35, -0.6, 0.6)
    }
    this.wob.rotation.set(tiltX, yaw, tiltZ)
    const follow = calm ? 1 : Math.min(1, dt * 18)
    this.hands[0].position.lerp(L, follow)
    this.hands[1].position.lerp(R, follow)
  }

  dispose(): void {
    this.root.removeFromParent()
    this.flag.geometry.dispose()
  }
}

/** Soft dark discs under every blob, drawn in one call (blobs move, so they skip the cached shadow map). */
export class Shadows {
  readonly mesh: THREE.InstancedMesh
  private m = new THREE.Matrix4()
  private s = new THREE.Vector3(BLOB_SCALE, 1, BLOB_SCALE)
  private q = new THREE.Quaternion()
  private p = new THREE.Vector3()

  constructor(max = 96) {
    const geo = new THREE.CircleGeometry(0.58, 18)
    geo.rotateX(-Math.PI / 2)
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#0B2530', transparent: true, opacity: 0.22, depthWrite: false }), max)
    this.mesh.renderOrder = 1
    this.mesh.frustumCulled = false
    this.mesh.count = 0
  }

  /** Put a disc under each of these blobs (ghosts and hidden ones are skipped). */
  update(blobs: Iterable<Blob>): void {
    let n = 0
    const max = this.mesh.instanceMatrix.count
    for (const b of blobs) {
      if (n >= max) break
      if (b.ghost || !b.root.parent || !b.root.visible || !b.root.parent.visible) continue
      b.root.getWorldPosition(this.p)
      this.p.y += 0.02
      this.mesh.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s))
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

/** The oversized slap glove: pops in beside the slapper, swings across, pops out. */
export class Glove {
  readonly root = new THREE.Group()
  private mesh = new THREE.Mesh(gloveGeometry(), opaque)
  private t = -1
  private stars: THREE.Mesh[] = []
  private starT = -1

  constructor() {
    this.mesh.rotation.z = Math.PI / 2
    this.root.add(this.mesh)
    this.root.visible = false
    const starGeo = new THREE.OctahedronGeometry(0.16, 0)
    const starMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' })
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(starGeo, starMat)
      s.visible = false
      this.stars.push(s)
    }
  }

  /** Add the hit stars to the scene (they fly from the victim, not with the glove). */
  attach(scene: THREE.Object3D): void {
    scene.add(this.root, ...this.stars)
  }

  get busy(): boolean {
    return this.t >= 0 || this.starT >= 0
  }

  /** Swing from `from` toward `to` (world positions at ground level). */
  swing(from: THREE.Vector3, to: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(to, from).setY(0)
    const yaw = Math.atan2(dir.x, dir.z)
    this.root.position.copy(from).setY(from.y + 1.0 * BLOB_SCALE)
    this.root.rotation.set(0, yaw, 0)
    this.root.userData.to = to.clone()
    this.root.visible = true
    this.t = 0
  }

  update(dt: number): void {
    if (this.t >= 0) {
      this.t += dt
      const k = this.t / 0.32
      // pop in (0-0.25), swing across (0.25-0.7), pop out (0.7-1). 1.6x the 0.9.0 size so it reads from the quarter camera.
      const pop = k < 0.25 ? k / 0.25 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1
      this.root.scale.setScalar(Math.max(0.001, pop * 1.6 * BLOB_SCALE))
      const a = THREE.MathUtils.lerp(-1.5, 0.25, THREE.MathUtils.clamp((k - 0.2) / 0.5, 0, 1))
      this.mesh.position.set(Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85)
      this.mesh.rotation.set(0, a + Math.PI / 2, Math.PI / 2)
      if (k >= 0.5 && this.starT < 0) this.burst(this.root.userData.to as THREE.Vector3)
      if (k >= 1) { this.t = -1; this.root.visible = false }
    }
    if (this.starT >= 0) {
      this.starT += dt
      this.stars.forEach((s, i) => {
        const a = (i / 3) * Math.PI * 2 + this.starT * 3
        const r = 0.3 + this.starT * 1.6
        s.position.set(s.userData.cx + Math.cos(a) * r, s.userData.cy + this.starT * 0.8, s.userData.cz + Math.sin(a) * r)
        s.rotation.y += dt * 10
        s.scale.setScalar(Math.max(0.01, 1 - this.starT / 0.5))
      })
      if (this.starT > 0.5) { this.starT = -1; this.stars.forEach((s) => (s.visible = false)) }
    }
  }

  private burst(at: THREE.Vector3): void {
    this.starT = 0
    for (const s of this.stars) {
      s.userData.cx = at.x
      s.userData.cy = at.y + 1.3
      s.userData.cz = at.z
      s.visible = true
    }
  }
}
