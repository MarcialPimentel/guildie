// A guild quarter (0.9.0, docs/living-city.md §2): a piazza with a fountain (the Duke's notice), the guild
// hall on the north side (its door is reserved for the guild trainer, M2 #49), twelve bottegas around the
// square for crafters' stalls, and the Steps back down to your quay on the sea side.
// The walkable area and arrival point match realtime/src/room.js BOUNDS and SPAWN.
import * as THREE from 'three'
import { bake, box, cyl, hipRoof, instanced, rng, solid, stripes, vertexColorMaterial } from './kit'
import type { PickId, ProfessionId } from './types'

export const QUARTER_BOUNDS = { minX: -21, maxX: 21, minZ: -13, maxZ: 15 }
export const QUARTER_SPAWN = new THREE.Vector3(0, 1, 13)

const GUILD: Record<ProfessionId, { hall: string; color: string; trim: string }> = {
  blacksmith: { hall: 'Arte dei Fabbri', color: '#B83A3A', trim: '#4B3A2E' },
  alchemist: { hall: 'Arte degli Speziali', color: '#2A4C9A', trim: '#1F8A87' },
  leatherworker: { hall: 'Arte dei Conciatori', color: '#4E6F2C', trim: '#E3C27A' },
}

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
  /** Paint a stall's sign ("" = to let). */
  paintSign(slot: number, text: string, friend: boolean): void
  dispose(): void
}

export function buildQuarter(quarter: ProfessionId): Quarter {
  const root = new THREE.Group()
  root.visible = false
  const r = rng(quarter.length * 31 + 5)
  const g = GUILD[quarter]
  const vc = vertexColorMaterial()
  const town = new THREE.Group()
  root.add(town)

  // the square: paving in two stone tones, a raised rim, the sea far below beyond a balustrade
  box(town, 60, 3, 44, '#E7D7B9', 0, -2, -2)
  for (let i = -4; i <= 4; i++) box(town, 0.18, 0.02, 30, '#D2BD98', i * 5, 1, 1, false)
  for (let i = -3; i <= 3; i++) box(town, 46, 0.02, 0.18, '#D2BD98', 0, 1, i * 5, false)
  box(town, 60, 0.6, 0.6, '#F4EBD8', 0, 1, 19.6)
  for (let x = -28; x <= 28; x += 1.4) if (Math.abs(x) > 3.4) cyl(town, 0.14, 0.18, 0.9, '#F4EBD8', x, 1.6, 19.6, 6)
  box(town, 60, 0.3, 0.8, '#E5D7BC', 0, 2.5, 19.6)
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 220), new THREE.MeshStandardMaterial({ color: '#2F9C9A', roughness: 0.4, flatShading: true }))
  sea.rotation.x = -Math.PI / 2
  sea.position.set(0, -26, 120)
  root.add(sea)
  box(town, 70, 30, 6, '#D9C29A', 0, -29, 23)   // the cliff face under the balustrade

  // the Steps down to the harbor (the way home)
  const steps = new THREE.Group()
  root.add(steps)
  for (let i = 0; i < 6; i++) box(steps, 6, 0.4, 0.9, i % 2 ? '#E7D7B9' : '#D2BD98', 0, 1 - (i + 1) * 0.4, 19.6 + i * 0.9)
  for (const dx of [-3.4, 3.4]) {
    box(steps, 0.6, 3.6, 0.6, '#F4EBD8', dx, 1, 18.6)
    solid(steps, new THREE.SphereGeometry(0.42, 8, 6), '#F2C53D', dx, 4.9, 18.6)
  }
  box(steps, 7.4, 0.6, 0.6, '#F4EBD8', 0, 4.6, 18.6)

  // the fountain with the Duke's notice
  const fountain = new THREE.Group()
  root.add(fountain)
  cyl(fountain, 2.6, 2.8, 0.7, '#F4EBD8', 0, 1, 0, 18)
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.06, 18), new THREE.MeshStandardMaterial({ color: '#86D8CC', roughness: 0.2, flatShading: true }))
  water.position.set(0, 1.62, 0)
  fountain.add(water)
  cyl(fountain, 0.35, 0.5, 2.2, '#E5D7BC', 0, 1.6, 0, 10)
  cyl(fountain, 1.1, 0.6, 0.4, '#F4EBD8', 0, 3.8, 0, 14)
  solid(fountain, new THREE.SphereGeometry(0.4, 10, 8), '#2F9C8A', 0, 4.6, 0)
  box(fountain, 2.4, 1.8, 0.16, '#6E4A2C', 0, 1.7, 2.95)
  box(fountain, 2.1, 1.5, 0.05, '#F6EEDC', 0, 1.85, 3.05, false)
  box(fountain, 0.7, 0.16, 0.06, '#A9492A', 0, 3.0, 3.07, false)    // the Duke's seal
  for (let i = 0; i < 4; i++) box(fountain, 1.6 - i * 0.2, 0.06, 0.02, '#4A6B6F', 0, 2.25 + i * 0.25, 3.09, false)

  // the guild hall on the north side, with banners in the guild's color
  const hall = new THREE.Group()
  root.add(hall)
  box(hall, 12, 8, 6, '#EFD9B5', 0, 1, -17.5)
  hipRoof(hall, 12.8, 6.8, 2.4, '#C4623A', 0, 9, -17.5)
  box(hall, 12.4, 0.3, 6.4, '#F7F3EA', 0, 9, -17.5)
  for (let i = 0; i < 5; i++) cyl(hall, 0.32, 0.36, 4.6, '#F4EBD8', -4.8 + i * 2.4, 1, -14.2, 10)
  box(hall, 11.4, 0.7, 0.7, '#E5D7BC', 0, 5.6, -14.2)
  for (const dx of [-3.6, 3.6]) {
    box(hall, 1.2, 3.2, 0.08, g.color, dx, 5.8, -14.45, false)
    box(hall, 1.2, 0.3, 0.1, g.trim, dx, 8.7, -14.45, false)
  }
  const door = new THREE.Group()
  root.add(door)
  box(door, 2.6, 3.6, 0.12, '#4A2E1E', 0, 1, -14.45, false)
  box(door, 3.2, 0.4, 0.3, g.trim, 0, 4.6, -14.4)
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.1), new THREE.MeshStandardMaterial({ map: plainSign(g.hall) }))
    sign.position.set(0, 7.4, -14.43)
    hall.add(sign)
  }

  // background houses and pines beyond the stalls
  for (let i = 0; i < 16; i++) {
    const x = -27 + i * 3.6 + (r() - 0.5)
    const h = 6 + r() * 6
    box(town, 3.4, h, 4, ['#F2B98B', '#F3D27A', '#EFA9A0', '#F5F0E4', '#BFE3D9'][i % 5], x, 1, -25 - r() * 2)
    hipRoof(town, 3.7, 4.3, 1.2, i % 2 ? '#C4623A' : '#A9492A', x, 1 + h, -26)
  }
  for (const [x, z] of [[-26, -6], [26, -8], [-25, 8], [25, 10]]) {
    cyl(town, 0.16, 0.22, 3.4, '#6E4A2C', x, 1, z, 5)
    const c = solid(town, new THREE.SphereGeometry(1.9, 8, 5), '#4F7A3A', x, 5.2, z)
    c.scale.y = 0.45
  }

  // twelve bottegas: four on each side (west, east) and four flanking the guild hall
  const slots: StallSlot[] = []
  const awningTex = stripes(g.color, '#F6F2E8', 9)
  const goodsMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.9, flatShading: true })
  const spots: { x: number; z: number; facing: number }[] = [
    ...[-9, -3, 3, 9].map((z) => ({ x: -24, z, facing: Math.PI / 2 })),
    ...[-9, -3, 3, 9].map((z) => ({ x: 24, z, facing: -Math.PI / 2 })),
    ...[-17, -10.5, 10.5, 17].map((x) => ({ x, z: -17, facing: 0 })),
  ]
  const plaster = ['#F2B98B', '#F3D27A', '#EFA9A0', '#F5F0E4', '#BFE3D9', '#F6C9A2']
  spots.forEach((sp, i) => {
    const grp = new THREE.Group()
    grp.position.set(sp.x, 0, sp.z)
    grp.rotation.y = sp.facing
    root.add(grp)
    // local space: the shop's front faces +z
    box(grp, 5, 5.2, 4, plaster[i % plaster.length], 0, 1, -0.5)
    hipRoof(grp, 5.4, 4.4, 1.5, i % 2 ? '#C4623A' : '#A9492A', 0, 6.2, -0.5)
    box(grp, 1.6, 2.6, 0.1, '#4A2E1E', -1.2, 1, 1.52, false)
    box(grp, 1.4, 1.2, 0.1, '#27444C', 1.1, 2.2, 1.52, false)
    box(grp, 3.6, 1.0, 1.1, '#A9784A', 0.4, 1, 2.4)                 // the counter
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.8), new THREE.MeshStandardMaterial({ map: awningTex, side: THREE.DoubleSide }))
    aw.rotation.x = -Math.PI / 2 + 0.35
    aw.position.set(0, 3.9, 2.2)
    aw.castShadow = true
    grp.add(aw)
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshStandardMaterial({ map: tex }))
    sign.position.set(0, 5.35, 1.53)
    grp.add(sign)
    const goods = instanced(grp, new THREE.BoxGeometry(0.5, 0.5, 0.5), goodsMat,
      Array.from({ length: 4 }, (_, k) => new THREE.Vector3(-0.8 + k * 0.8, 2.25, 2.4)),
      { colors: (k) => ['#F2C53D', '#2FB59D', '#C7733E', '#EFA9A0'][k], rotY: (k) => k * 0.5 })
    const own = vertexColorMaterial()
    bake(grp, own)
    const front = new THREE.Vector3(0, 1, 4.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), sp.facing).add(new THREE.Vector3(sp.x, 0, sp.z))
    const labelPoint = new THREE.Vector3(0, 7.9, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), sp.facing).add(new THREE.Vector3(sp.x, 0, sp.z))
    slots.push({ group: grp, front, facing: sp.facing, sign: { canvas, tex }, goods, labelPoint, material: own })
  })

  const picks = new Map<PickId, THREE.Object3D[]>([['duke', [fountain]], ['trainer', [door]], ['home', [steps]]])
  const highlight = new Map<PickId, THREE.MeshStandardMaterial[]>()
  for (const [id, grp] of [['duke', fountain], ['trainer', door], ['home', steps]] as [PickId, THREE.Group][]) {
    const own = vertexColorMaterial()
    bake(grp, own)
    highlight.set(id, [own])
  }
  bake(hall, vc)
  bake(town, vc)

  const focus: Partial<Record<PickId, THREE.Vector3>> = {
    duke: new THREE.Vector3(0, 2, 3), trainer: new THREE.Vector3(0, 3, -14), home: new THREE.Vector3(0, 1, 17),
  }
  const labels: Partial<Record<PickId, THREE.Vector3>> = {
    duke: new THREE.Vector3(0, 5.6, 0), trainer: new THREE.Vector3(0, 12.6, -17), home: new THREE.Vector3(0, 6, 18.6),
  }

  const paintSign = (slot: number, text: string, friend: boolean) => {
    const s = slots[slot]
    if (!s) return
    const c = s.sign.canvas.getContext('2d')!
    c.fillStyle = text ? '#10323A' : '#6B7F80'
    c.fillRect(0, 0, 512, 128)
    c.strokeStyle = friend ? '#F2C53D' : '#E7D7B9'
    c.lineWidth = friend ? 12 : 6
    c.strokeRect(10, 10, 492, 108)
    c.fillStyle = '#F6EEDC'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const t = text ? `${friend ? '★ ' : ''}${text}` : 'To let'
    let size = 54
    do {
      c.font = `700 ${size}px "Fraunces Variable", Georgia, serif`
      size -= 2
    } while (c.measureText(t).width > 460 && size > 16)
    c.fillText(t, 256, 68)
    s.sign.tex.needsUpdate = true
  }
  slots.forEach((_, i) => paintSign(i, '', false))

  return {
    root, slots, picks, highlight, paintSign,
    focusPoint: (id) => (focus[id] ?? new THREE.Vector3(0, 2, 0)).clone(),
    labelPoint: (id) => labels[id] ?? new THREE.Vector3(0, -100, 0),
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose()
          mat.dispose()
        }
      })
      root.removeFromParent()
    },
  }
}

/** A painted name board for the guild hall. */
function plainSign(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#10323A'
  g.fillRect(0, 0, 640, 128)
  g.strokeStyle = '#F2C53D'
  g.lineWidth = 8
  g.strokeRect(10, 10, 620, 108)
  g.fillStyle = '#F6EEDC'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '700 56px "Fraunces Variable", Georgia, serif'
  g.fillText(text, 320, 68)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
