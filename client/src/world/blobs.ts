// Blob merchants (docs/art-direction.md §9): chunky, wobbly people in guild dress and hats, plus the
// oversized slap glove. Each blob is one merged body mesh (body, dress, face, feet and hat in vertex colors)
// and two hand meshes, so a crowd of 30 stays around 100 draw calls. Wobble is a spring on squash and
// stretch: no skeleton, no physics engine.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type Dress = 'blacksmith' | 'alchemist' | 'leatherworker' | 'porter' | 'priest' | 'fishwife' | 'herald'

/** Body colors (plaster pastels); server/app/lib/city.php CITY_LOOKS must match the count. */
export const BODY_COLORS = ['#F2B98B', '#F3D27A', '#EFA9A0', '#BFE3D9', '#E9D5F0', '#F6C9A2']
const INK = '#2B2A33'
export const BLOB_SCALE = 1.4

type Part = { geo: THREE.BufferGeometry; color: string; x: number; y: number; z: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number }

/** Paint a geometry one color and move it into place (for merging). */
function part(p: Part): THREE.BufferGeometry {
  const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone())
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y, p.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)),
    new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1),
  )
  g.applyMatrix4(m)
  const c = new THREE.Color(p.color)
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

const bodyCache = new Map<string, THREE.BufferGeometry>()

/** The merged body for a dress and body color (cached: at most a few dozen combinations). */
function bodyGeometry(dress: Dress, look: number): THREE.BufferGeometry {
  const key = `${dress}:${look}`
  const hit = bodyCache.get(key)
  if (hit) return hit
  const skin = BODY_COLORS[((look % BODY_COLORS.length) + BODY_COLORS.length) % BODY_COLORS.length]
  const parts: Part[] = [
    { geo: new THREE.CapsuleGeometry(0.5, 0.42, 4, 10), color: skin, x: 0, y: 0.72, z: 0 },
    { geo: new THREE.SphereGeometry(0.17, 8, 6), color: '#5A3A28', x: -0.22, y: 0.05, z: 0.1, sy: 0.55, sz: 1.3 },
    { geo: new THREE.SphereGeometry(0.17, 8, 6), color: '#5A3A28', x: 0.22, y: 0.05, z: 0.1, sy: 0.55, sz: 1.3 },
    { geo: new THREE.SphereGeometry(0.065, 6, 5), color: INK, x: -0.16, y: 1.06, z: 0.45 },
    { geo: new THREE.SphereGeometry(0.065, 6, 5), color: INK, x: 0.16, y: 1.06, z: 0.45 },
    { geo: new THREE.SphereGeometry(0.08, 6, 4), color: '#E98A86', x: -0.3, y: 0.93, z: 0.39, sz: 0.4 },
    { geo: new THREE.SphereGeometry(0.08, 6, 4), color: '#E98A86', x: 0.3, y: 0.93, z: 0.39, sz: 0.4 },
  ]
  const robe = (color: string, top: number, h: number) => parts.push({ geo: new THREE.CylinderGeometry(0.51, 0.58, h, 12, 1, true), color, x: 0, y: top - h / 2, z: 0 })
  switch (dress) {
    case 'blacksmith':
      parts.push({ geo: new THREE.BoxGeometry(0.62, 0.66, 0.08), color: '#4B3A2E', x: 0, y: 0.55, z: 0.47, rx: -0.08 })
      parts.push({ geo: new THREE.BoxGeometry(0.06, 0.4, 0.06), color: '#4B3A2E', x: -0.24, y: 0.98, z: 0.42, rx: -0.3 })
      parts.push({ geo: new THREE.BoxGeometry(0.06, 0.4, 0.06), color: '#4B3A2E', x: 0.24, y: 0.98, z: 0.42, rx: -0.3 })
      parts.push({ geo: new THREE.CylinderGeometry(0.33, 0.38, 0.24, 10), color: '#B83A3A', x: 0.02, y: 1.43, z: -0.02, rz: 0.12 })
      parts.push({ geo: new THREE.SphereGeometry(0.33, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), color: '#B83A3A', x: 0.04, y: 1.53, z: -0.02, sy: 0.55 })
      break
    case 'alchemist':
      robe('#1F8A87', 0.75, 0.7)
      parts.push({ geo: new THREE.ConeGeometry(0.4, 0.8, 10), color: '#2A4C9A', x: 0, y: 1.73, z: -0.03, rz: -0.08 })
      parts.push({ geo: new THREE.CylinderGeometry(0.46, 0.46, 0.06, 12), color: '#2A4C9A', x: 0, y: 1.36, z: 0 })
      parts.push({ geo: new THREE.SphereGeometry(0.09, 6, 5), color: '#F2C53D', x: 0.08, y: 2.12, z: -0.05 })
      break
    case 'leatherworker':
      robe('#4E6F2C', 0.95, 0.75)
      parts.push({ geo: new THREE.CylinderGeometry(0.66, 0.66, 0.05, 14), color: '#E3C27A', x: 0, y: 1.38, z: 0 })
      parts.push({ geo: new THREE.CylinderGeometry(0.3, 0.34, 0.26, 12), color: '#E3C27A', x: 0, y: 1.52, z: 0 })
      parts.push({ geo: new THREE.CylinderGeometry(0.345, 0.345, 0.07, 12), color: '#A9492A', x: 0, y: 1.44, z: 0 })
      break
    case 'porter':
      robe('#F5F0E4', 0.85, 0.7)
      parts.push({ geo: new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), color: '#C4623A', x: 0, y: 1.22, z: -0.02, sy: 0.7 })
      break
    case 'priest':
      robe('#2B2A33', 1.0, 1.0)
      parts.push({ geo: new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10), color: '#2B2A33', x: 0, y: 1.42, z: 0 })
      parts.push({ geo: new THREE.CylinderGeometry(0.5, 0.5, 0.04, 14), color: '#2B2A33', x: 0, y: 1.37, z: 0 })
      break
    case 'fishwife':
      robe('#2A4C9A', 0.8, 0.65)
      parts.push({ geo: new THREE.BoxGeometry(0.55, 0.5, 0.06), color: '#F6EEDC', x: 0, y: 0.5, z: 0.5 })
      parts.push({ geo: new THREE.SphereGeometry(0.44, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), color: '#F2C53D', x: 0, y: 1.2, z: -0.03, sy: 0.75 })
      break
    case 'herald':
      robe('#2A4C9A', 0.95, 0.8)
      parts.push({ geo: new THREE.BoxGeometry(0.5, 0.75, 0.06), color: '#F2C53D', x: 0, y: 0.62, z: 0.5 })
      parts.push({ geo: new THREE.CylinderGeometry(0.38, 0.4, 0.2, 12), color: '#A9492A', x: 0, y: 1.42, z: 0, rz: -0.1 })
      parts.push({ geo: new THREE.ConeGeometry(0.06, 0.7, 5), color: '#F6EEDC', x: 0.28, y: 1.85, z: -0.1, rz: -0.5 })
      break
  }
  const merged = mergeGeometries(parts.map(part))!
  bodyCache.set(key, merged)
  return merged
}

let gloveGeo: THREE.BufferGeometry | null = null
function gloveGeometry(): THREE.BufferGeometry {
  if (gloveGeo) return gloveGeo
  const W = '#F7F3EA'
  const finger = (x: number, len: number, rz = 0): Part => ({ geo: new THREE.CapsuleGeometry(0.1, len, 3, 8), color: W, x, y: 0.42 + len / 2, z: 0, rz })
  gloveGeo = mergeGeometries([
    { geo: new THREE.SphereGeometry(0.34, 12, 8), color: W, x: 0, y: 0.22, z: 0, sx: 1, sy: 0.95, sz: 0.55 },
    finger(-0.21, 0.24, 0.12), finger(-0.07, 0.3), finger(0.07, 0.3), finger(0.21, 0.24, -0.12),
    { geo: new THREE.CapsuleGeometry(0.1, 0.22, 3, 8), color: W, x: 0.36, y: 0.16, z: 0.04, rz: -0.9 },
    { geo: new THREE.CylinderGeometry(0.28, 0.32, 0.22, 12), color: '#F2C53D', x: 0, y: -0.12, z: 0 },
    { geo: new THREE.BoxGeometry(0.42, 0.03, 0.04), color: '#C9BFA8', x: 0, y: 0.18, z: 0.19 },
  ].map(part))!
  return gloveGeo
}

const opaque = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true })
const ghostMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, transparent: true, opacity: 0.42, depthWrite: false })
const handMats = new Map<string, THREE.MeshStandardMaterial>()
const handGeo = new THREE.SphereGeometry(0.16, 8, 6)
const ringMat = new THREE.MeshBasicMaterial({ color: '#F2C53D', transparent: true, opacity: 0.85, depthWrite: false })
const ringGeo = new THREE.RingGeometry(0.62, 0.78, 28)
ringGeo.rotateX(-Math.PI / 2)
const flagMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', side: THREE.DoubleSide, flatShading: true })
// Blobs move, so they don't use the (cached) shadow map: each gets a soft dark disc on the ground instead.
const discGeo = new THREE.CircleGeometry(0.58, 20)
discGeo.rotateX(-Math.PI / 2)
const discMat = new THREE.MeshBasicMaterial({ color: '#0B2530', transparent: true, opacity: 0.22, depthWrite: false })

function handMat(color: string, ghost: boolean): THREE.MeshStandardMaterial {
  const key = color + (ghost ? ':g' : '')
  let m = handMats.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, transparent: ghost, opacity: ghost ? 0.42 : 1, depthWrite: !ghost })
    handMats.set(key, m)
  }
  return m
}

export interface BlobOptions { dress: Dress; look: number; ghost?: boolean; me?: boolean }

/** One blob merchant. Move `root` yourself; call update() every frame with how fast it is walking. */
export class Blob {
  readonly root = new THREE.Group()
  private wob = new THREE.Group()
  private body: THREE.Mesh
  private hands: THREE.Mesh[]
  private flag: THREE.Mesh
  private sq = 0
  private sqV = 0
  private lean = 0
  private leanV = 0
  private phase = Math.random() * 6
  private waveT = 0
  private wasMoving = false
  /** Hat height, for labels. */
  readonly top: number

  constructor(readonly opts: BlobOptions) {
    const skin = BODY_COLORS[((opts.look % BODY_COLORS.length) + BODY_COLORS.length) % BODY_COLORS.length]
    this.body = new THREE.Mesh(bodyGeometry(opts.dress, opts.look), opts.ghost ? ghostMat : opaque)
    this.body.castShadow = false
    this.body.receiveShadow = !opts.ghost
    this.hands = [-1, 1].map((side) => {
      const h = new THREE.Mesh(handGeo, handMat(skin, !!opts.ghost))
      h.position.set(side * 0.6, 0.62, 0.08)
      return h
    })
    this.wob.add(this.body, ...this.hands)
    this.root.add(this.wob)
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), flagMat)
    this.flag.position.set(-0.25, 1.95, 0)
    this.flag.visible = false
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), flagMat)
    pole.position.set(0.14, -0.15, 0)
    this.flag.add(pole)
    this.wob.add(this.flag)
    if (!opts.ghost) {
      const disc = new THREE.Mesh(discGeo, discMat)
      disc.position.y = 0.02
      disc.renderOrder = 1
      this.root.add(disc)
    }
    if (opts.me) {
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.position.y = 0.03
      ring.renderOrder = 1
      this.root.add(ring)
    }
    // Chunky: a blob stands a bit taller than a doorway's lintel is wide, so it reads from the default camera.
    this.root.scale.setScalar(BLOB_SCALE)
    this.top = (opts.dress === 'alchemist' ? 2.3 : 1.9) * BLOB_SCALE
  }

  /** A white flag on the hat: this merchant has slaps off. */
  setSlapsOff(off: boolean): void {
    this.flag.visible = off
  }

  wave(): void {
    this.waveT = 1.2
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

  /** Animate: speed is how fast root moved this frame (m/s). calm = reduced motion (no wobble). */
  update(dt: number, speed: number, calm: boolean): void {
    const moving = speed > 0.2
    if (this.wasMoving && !moving) this.bounce(2.5)
    this.wasMoving = moving
    if (calm) {
      this.wob.scale.set(1, 1, 1)
      this.wob.rotation.set(0, 0, 0)
      this.wob.position.y = 0
      this.hands[0].position.set(-0.6, 0.62, 0.08)
      this.hands[1].position.set(0.6, this.waveT > 0 ? 1.4 : 0.62, 0.08)
      this.waveT = Math.max(0, this.waveT - dt)
      return
    }
    // springs: squash (scale) and lean (tilt)
    this.sqV += (-60 * this.sq - 7 * this.sqV) * dt
    this.sq += this.sqV * dt
    this.leanV += (-40 * this.lean - 6 * this.leanV) * dt
    this.lean += this.leanV * dt
    let bob = 0
    if (moving) {
      this.phase += dt * Math.min(16, 6 + speed * 2.2)
      bob = Math.abs(Math.sin(this.phase)) * 0.08
    }
    const s = THREE.MathUtils.clamp(this.sq + (moving ? Math.sin(this.phase * 2) * 0.03 : 0), -0.3, 0.3)
    this.wob.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5)
    this.wob.position.y = bob
    this.wob.rotation.x = moving ? 0.14 : 0
    this.wob.rotation.z = THREE.MathUtils.clamp(this.lean * 0.35, -0.6, 0.6)
    // hands swing while walking; one waves
    const swing = moving ? Math.sin(this.phase) * 0.22 : 0
    this.hands[0].position.set(-0.6, 0.62, 0.08 + swing)
    if (this.waveT > 0) {
      this.waveT -= dt
      this.hands[1].position.set(0.55 + Math.sin(this.waveT * 18) * 0.12, 1.45, 0.15)
    } else {
      this.hands[1].position.set(0.6, 0.62, 0.08 - swing)
    }
  }

  dispose(): void {
    this.root.removeFromParent()
    this.flag.geometry.dispose()
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
    this.mesh.position.set(0, 0, 0)
    this.root.add(this.mesh)
    this.root.visible = false
    const starGeo = new THREE.OctahedronGeometry(0.12, 0)
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
      // pop in (0-0.25), swing across (0.25-0.7), pop out (0.7-1)
      const pop = k < 0.25 ? k / 0.25 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1
      this.root.scale.setScalar(Math.max(0.001, pop * 1.15 * BLOB_SCALE))
      const a = THREE.MathUtils.lerp(-1.5, 0.25, THREE.MathUtils.clamp((k - 0.2) / 0.5, 0, 1))
      this.mesh.position.set(Math.sin(a) * 1.0, 0, Math.cos(a) * 1.0)
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
