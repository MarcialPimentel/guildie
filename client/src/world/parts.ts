// Shapes for building people (blobs.ts and the guild kits in kits/): each part is one colored geometry,
// placed on the blob and merged into one mesh by blobs.ts.
import * as THREE from 'three'

export const INK = '#2B2A33'
/** `vc`: keep the geometry's own vertex colors (a model file), painting only its skin-marked vertices with `c`. */
export type Part = { geo: THREE.BufferGeometry; c: string; x: number; y: number; z: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; order?: THREE.EulerOrder; vc?: boolean }
export const P = (geo: THREE.BufferGeometry, c: string, x = 0, y = 0, z = 0, o: Partial<Part> = {}): Part => ({ geo, c, x, y, z, ...o })
// 0.10.1: people are smooth-shaded with 1.5x the curve segments of 0.10.0 (the town stays faceted).
// Every rounded part goes through these helpers, so SEG sets how smooth the whole cast is.
export const SEG = 1.5
export const seg = (n: number, k = SEG) => Math.max(3, Math.round(n * k))
export const sph = (r: number, w = 8, h = 6, ...a: number[]) => new THREE.SphereGeometry(r, seg(w), seg(h), ...a)
export const cyl = (rt: number, rb: number, h: number, s = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg(s, 1.6), 1, open)
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
export const cone = (r: number, h: number, s = 8) => new THREE.ConeGeometry(r, h, seg(s, 1.6))
export const tor = (r: number, t: number, rs = 3, ts = 12, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, seg(rs), seg(ts), arc)
export const dome = (r: number, w = 8, h = 3) => new THREE.SphereGeometry(r, seg(w), seg(h), 0, Math.PI * 2, 0, Math.PI / 2)
export const capsule = (r: number, l: number, c = 2, s = 6) => new THREE.CapsuleGeometry(r, l, seg(c), seg(s))


// dress pieces shared by several characters
export const robe = (c: string, top: number, h: number, flare = 0.58) => P(cyl(0.51, flare, h, 11, true), c, 0, top - h / 2, 0)
export const band = (c: string, y: number, r = 0.54) => P(cyl(r, r, 0.08, 11, true), c, 0, y, 0)
export const apron = (c: string) => [P(box(0.62, 0.66, 0.08), c, 0, 0.55, 0.47, { rx: -0.08 }), P(box(0.06, 0.4, 0.06), c, -0.24, 0.98, 0.42, { rx: -0.3 }), P(box(0.06, 0.4, 0.06), c, 0.24, 0.98, 0.42, { rx: -0.3 })]
export const beard = () => P(sph(0.34, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#F5F2EA', 0, 0.98, 0.26, { sz: 0.75 })
export const chain = () => [P(tor(0.46, 0.035, 3, 14), '#E3B54A', 0, 0.98, 0.02, { rx: Math.PI / 2 + 0.25 }), P(sph(0.09, 6, 4), '#E3B54A', 0, 0.86, 0.5)]

/** Props held in the right hand. */
export type Prop = 'oar' | 'fan' | 'loaf' | 'mallet' | 'spyglass' | 'jar' | 'basket' | 'magnifier' | 'parasol' | 'fish' | 'sack' | 'crate' | 'purse' | 'trumpet' | 'hammer' | 'note' | 'scroll' | 'bell' | 'quill'
