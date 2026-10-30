// Building blocks for the low-poly harbor: flat-colored boxes, roofs and cylinders, plus bake(), which
// merges everything static into a few meshes so the whole town draws in a handful of GPU calls.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Seeded random numbers, so the town looks the same on every visit. */
export function rng(seed: number): () => number {
  let s = seed
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const flatCache = new Map<string, THREE.MeshStandardMaterial>()

/** A plain flat color. bake() turns every mesh using one into vertex colors on a single shared material. */
export function flat(hex: string): THREE.MeshStandardMaterial {
  let m = flatCache.get(hex)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, flatShading: true })
    m.userData.flat = true
    flatCache.set(hex, m)
  }
  return m
}

export type Mat = string | THREE.Material
const asMat = (m: Mat): THREE.Material => (typeof m === 'string' ? flat(m) : m)

function place(parent: THREE.Object3D, mesh: THREE.Mesh, cast = true): THREE.Mesh {
  mesh.castShadow = cast
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** A box whose bottom sits at y. */
export function box(parent: THREE.Object3D, w: number, h: number, d: number, m: Mat, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), asMat(m))
  mesh.position.set(x, y + h / 2, z)
  return place(parent, mesh, cast)
}

/** A cylinder whose bottom sits at y. */
export function cyl(parent: THREE.Object3D, rt: number, rb: number, h: number, m: Mat, x: number, y: number, z: number, seg = 8): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), asMat(m))
  mesh.position.set(x, y + h / 2, z)
  return place(parent, mesh)
}

/** Any geometry, centered at x, y, z. */
export function solid(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: Mat, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, asMat(m))
  mesh.position.set(x, y, z)
  return place(parent, mesh, cast)
}

/** A four-sided hip roof over a w × d footprint, its eaves at y. */
export function hipRoof(parent: THREE.Object3D, w: number, d: number, h: number, m: Mat, x: number, y: number, z: number): THREE.Mesh {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4)
  g.rotateY(Math.PI / 4)
  g.translate(0, 0.5, 0)
  const mesh = new THREE.Mesh(g, asMat(m))
  mesh.scale.set(w, h, d)
  mesh.position.set(x, y, z)
  return place(parent, mesh)
}

/** Alternating stripes (awnings, flags). */
export function stripes(a: string, b: string, n = 8): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 32
  const g = c.getContext('2d')!
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a
    g.fillRect((i * c.width) / n, 0, c.width / n + 1, c.height)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A painted sign: light text on a dark board with a lemon border. The text shrinks to fit. */
export function signTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const draw = () => {
    g.fillStyle = '#10323A'
    g.fillRect(0, 0, 512, 128)
    g.strokeStyle = '#F2C53D'
    g.lineWidth = 8
    g.strokeRect(10, 10, 492, 108)
    g.fillStyle = '#F6EEDC'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = 58
    do {
      g.font = `700 ${size}px "Fraunces Variable", Georgia, serif`
      size -= 2
    } while (g.measureText(text).width > 450 && size > 18)
    g.fillText(text, 256, 68)
    tex.needsUpdate = true
  }
  draw()
  document.fonts?.load('700 52px "Fraunces Variable"').then(draw).catch(() => {})
  return tex
}

/** One material for everything baked from flat colors (they become vertex colors). */
export function vertexColorMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true })
}

/**
 * Merge the static meshes under root into one mesh per material (flat colors share one vertex-colored
 * material). Textured, transparent, instanced and `userData.keep` meshes are left alone, so they can
 * still animate. Returns the new meshes, added to root in root's own space.
 */
export function bake(root: THREE.Object3D, flatMaterial: THREE.MeshStandardMaterial): THREE.Mesh[] {
  root.updateMatrixWorld(true)
  const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>()
  const baked: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return
    if (m.userData.keep || o.parent?.userData.keep) return
    const mat = m.material as THREE.MeshStandardMaterial
    if (mat.map || mat.transparent) return
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld))
    // a model with its own vertex colors (the Blender town kit, townKit.ts) keeps them
    const ownColors = !!mat.vertexColors && !!g.attributes.color
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(ownColors && name === 'color')) g.deleteAttribute(name)
    if (!g.attributes.normal) g.computeVertexNormals()
    const isFlat = !!mat.userData.flat
    if (isFlat && !ownColors) {
      const n = g.attributes.position.count
      const c = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        c[i * 3] = mat.color.r
        c[i * 3 + 1] = mat.color.g
        c[i * 3 + 2] = mat.color.b
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    }
    const key = (isFlat ? 'flat' : mat.uuid) + (m.castShadow ? ':cast' : ':nocast')
    let b = buckets.get(key)
    if (!b) buckets.set(key, (b = { mat: isFlat ? flatMaterial : mat, cast: m.castShadow, geos: [] }))
    b.geos.push(g)
    baked.push(m)
  })
  for (const m of baked) {
    m.parent?.remove(m)
    m.geometry.dispose()
  }
  const out: THREE.Mesh[] = []
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos)
    b.geos.forEach((g) => g.dispose())
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, b.mat)
    mesh.castShadow = b.cast
    mesh.receiveShadow = true
    root.add(mesh)
    out.push(mesh)
  }
  return out
}

/** An instanced set of one shape at fixed spots; show the first n with `mesh.count = n`. */
export function instanced(
  parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, spots: THREE.Vector3[],
  opts: { rotY?: (i: number) => number; scale?: (i: number) => THREE.Vector3; colors?: (i: number) => string } = {},
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  spots.forEach((p, i) => {
    q.setFromAxisAngle(up, opts.rotY?.(i) ?? 0)
    m.compose(p, q, opts.scale?.(i) ?? new THREE.Vector3(1, 1, 1))
    mesh.setMatrixAt(i, m)
    if (opts.colors) mesh.setColorAt(i, new THREE.Color(opts.colors(i)))
  })
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.count = 0
  parent.add(mesh)
  return mesh
}
