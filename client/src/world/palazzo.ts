// The Piazza del Palazzo (0.11.0; the only square since 0.13.0, docs/palazzo.md): the shared square up the
// Steps where every guild meets. The Palazzo (city hall) stands on the north side with an arcaded loggia,
// crenellations and a bell tower; its door opens the Hall of honor and the city's merchants, and the Factotum's
// portrait hangs above it. In the middle is the marketplace (0.13.0, like a grand exchange): a ring of vendor
// stalls, one per guild (from content) plus the selling desk, around the Factotum's statue. The Duke's lectern
// stands on the east side. The officials and the vendors are characters the engine places at npcSpots.
// Walkable area and arrival point: realtime/src/room.js.
import * as THREE from 'three'
import { GUILDS } from '../guilds'
import { bake, box, cyl, flat, hipRoof, rng, solid, stripes, vertexColorMaterial } from './kit'
import type { Quarter } from './square'
import { HOUSE_WIDTH, townPiece } from './townKit'
import type { PickId } from './types'

export function buildPalazzo(): Quarter {
  const root = new THREE.Group()
  root.visible = false
  const r = rng(1499)
  const vc = vertexColorMaterial()
  const flatGlass = flat('#27444C')
  const town = new THREE.Group()
  root.add(town)

  // the square: warm paving in a herringbone of two tones, a balustrade over the sea, the cliff below
  box(town, 60, 3, 44, '#E9D3AE', 0, -2, -2)
  for (let i = -5; i <= 5; i++) box(town, 0.2, 0.02, 30, '#D6B98C', i * 4, 1, 1, false)
  for (let i = -3; i <= 3; i++) box(town, 46, 0.02, 0.2, '#D6B98C', 0, 1, i * 4.4, false)
  cyl(town, 7, 7, 0.04, '#D6B98C', 0, 1, 0, 24)
  cyl(town, 6.6, 6.6, 0.05, '#E9D3AE', 0, 1, 0, 24)
  box(town, 60, 0.6, 0.6, '#F4EBD8', 0, 1, 19.6)
  for (let x = -28; x <= 28; x += 1.4) if (Math.abs(x) > 3.4) cyl(town, 0.14, 0.18, 0.9, '#F4EBD8', x, 1.6, 19.6, 6)
  box(town, 60, 0.3, 0.8, '#E5D7BC', 0, 2.5, 19.6)
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 220), new THREE.MeshStandardMaterial({ color: '#2F9C9A', roughness: 0.4, flatShading: true }))
  sea.rotation.x = -Math.PI / 2
  sea.position.set(0, -26, 120)
  root.add(sea)
  box(town, 70, 30, 6, '#D9C29A', 0, -29, 23)

  // the Steps down to the harbor
  const steps = new THREE.Group()
  root.add(steps)
  for (let i = 0; i < 6; i++) box(steps, 6, 0.4, 0.9, i % 2 ? '#E9D3AE' : '#D6B98C', 0, 1 - (i + 1) * 0.4, 19.6 + i * 0.9)
  for (const dx of [-3.4, 3.4]) {
    box(steps, 0.6, 3.6, 0.6, '#F4EBD8', dx, 1, 18.6)
    solid(steps, new THREE.SphereGeometry(0.42, 8, 6), '#F2C53D', dx, 4.9, 18.6)
  }
  box(steps, 7.4, 0.6, 0.6, '#F4EBD8', 0, 4.6, 18.6)

  // the Palazzo: two floors over an arcaded loggia, crenellated, with a bell tower on its east side
  const hall = new THREE.Group()
  root.add(hall)
  const HZ = -18.5
  // since 0.17.0 the Palazzo and its tower are the Blender town kit (townKit.ts): a Renaissance palazzo with a
  // Brunelleschi loggia and a rusticated ground floor, and a brick campanile; the code below is the fallback
  const TX = 14
  const kit = townPiece(hall, 'palazzo', 0, 1, HZ, { glassMat: flatGlass }) && townPiece(hall, 'campanile', TX, 1, HZ - 0.5, { glassMat: flatGlass })
  if (!kit) {
  box(hall, 22, 12, 7, '#EBC79A', 0, 1, HZ)                       // the body
  box(hall, 22.6, 0.5, 7.6, '#F4EBD8', 0, 5.4, HZ)                // string course between the floors
  for (let i = 0; i < 11; i++) box(hall, 1.1, 1.1, 7.6, '#D9A877', -10.4 + i * 2.08, 13, HZ)   // merlons
  box(hall, 22.6, 0.4, 7.6, '#D9A877', 0, 12.6, HZ)
  // the loggia: seven arches on columns in front of the ground floor
  box(hall, 21, 0.6, 3.4, '#F4EBD8', 0, 5.1, HZ + 4.9)
  for (let i = 0; i < 8; i++) cyl(hall, 0.36, 0.42, 4.1, '#F7F3EA', -9.8 + i * 2.8, 1, HZ + 6.3, 10)
  for (let i = 0; i < 7; i++) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.18, 4, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#F7F3EA', flatShading: true }))
    arch.position.set(-8.4 + i * 2.8, 4.0, HZ + 6.3)
    hall.add(arch)
  }
  hipRoof(hall, 21.6, 3.8, 0.9, '#C4623A', 0, 5.7, HZ + 4.9)
  // pointed windows on the upper floor
  for (let i = 0; i < 7; i++) {
    if (i === 3) continue   // the middle bay holds the Factotum's portrait
    const wx = -8.4 + i * 2.8
    box(hall, 1.2, 2.4, 0.12, '#27444C', wx, 7.4, HZ + 3.52, false)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.8, 4), new THREE.MeshStandardMaterial({ color: '#27444C', flatShading: true }))
    tip.rotation.y = Math.PI / 4
    tip.scale.z = 0.12
    tip.position.set(wx, 10.2, HZ + 3.52)
    hall.add(tip)
  }
  }
  // banners of every guild on poles along the façade (from content: a new guild gets its banner); with the
  // kit's deep cornice they fly from poles on top of it
  GUILDS.forEach((g, i) => {
    const x = (i - (GUILDS.length - 1) / 2) * 6
    const [y, z] = kit ? [13.3, HZ + 4.55] : [11.8, HZ + 3.7]
    cyl(hall, 0.06, 0.06, 4, '#4B5257', x, y, z, 5)
    box(hall, 1.4, 2.4, 0.06, g.color, x + 0.74, y + 1.2, z, false)
    box(hall, 1.4, 0.3, 0.07, g.trim, x + 0.74, y + 3.3, z, false)
  })
  // the bell tower (campanile) with a clock
  if (!kit) {
  box(hall, 4.4, 20, 4.4, '#E2B987', TX, 1, HZ - 0.5)
  box(hall, 5.0, 0.4, 5.0, '#F4EBD8', TX, 21, HZ - 0.5)
  for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) box(hall, 0.6, 3.2, 0.6, '#F4EBD8', TX + dx, 21.4, HZ - 0.5 + dz)
  solid(hall, new THREE.SphereGeometry(0.9, 8, 6), '#C79A3A', TX, 22.9, HZ - 0.5)        // the bell
  box(hall, 5.0, 0.4, 5.0, '#D9A877', TX, 24.6, HZ - 0.5)
  hipRoof(hall, 5.0, 5.0, 3.6, '#A9492A', TX, 25, HZ - 0.5)
  }
  cyl(hall, 1.3, 1.3, 0.12, '#F6EEDC', TX, 15.4, HZ + 1.75, 16).rotation.x = Math.PI / 2
  box(hall, 0.1, 1.0, 0.06, '#2B2A33', TX, 15.5, HZ + 1.85, false)
  box(hall, 0.7, 0.1, 0.06, '#2B2A33', TX + 0.3, 15.9, HZ + 1.85, false)

  // the Factotum's portrait (0.13.0): a gilded frame over the door; the engine paints the portrait into it
  const frame = new THREE.Group()
  root.add(frame)
  box(frame, 2.9, 3.5, 0.2, '#C79A3A', 0, 6.5, HZ + 3.55)
  box(frame, 3.3, 0.3, 0.3, '#F2C53D', 0, 10.0, HZ + 3.6)
  const portrait = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85, map: blankCanvas() })
  const canvasPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.9), portrait)
  canvasPlane.position.set(0, 8.25, HZ + 3.67)
  canvasPlane.userData.keep = true
  root.add(canvasPlane)

  // the door: the Hall of honor
  const door = new THREE.Group()
  root.add(door)
  box(door, 3.0, 3.8, 0.14, '#4A2E1E', 0, 1, HZ + 3.55, false)
  box(door, 3.6, 0.4, 0.4, '#F2C53D', 0, 4.8, HZ + 3.6)
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.2), new THREE.MeshStandardMaterial({ map: plaque('Hall of honor') }))
    sign.position.set(0, 5.95, HZ + 6.75)
    door.add(sign)
  }

  // the marketplace (0.13.0): a ring of vendor stalls around the statue, open toward the Steps. One vendor per
  // guild sells that guild's goods (a new guild in content gets a stall), and the selling desk takes your
  // listings and buy offers.
  const vendors: { id: PickId; label: string; color: string; trim: string; character: string }[] = [
    ...GUILDS.map((g) => ({ id: `vendor:${g.id}` as PickId, label: g.goods, color: g.color, trim: g.trim, character: g.id })),
    { id: 'desk' as PickId, label: 'Selling desk', color: '#1F8A87', trim: '#F2C53D', character: 'traders' },
  ]
  const RING = 9.5
  const stalls: { id: PickId; grp: THREE.Group; at: THREE.Vector3; facing: number }[] = []
  vendors.forEach((v, i) => {
    // spread over the sides and the back of the circle (the gap faces the Steps)
    const t = vendors.length === 1 ? 0.5 : i / (vendors.length - 1)
    const a = THREE.MathUtils.degToRad(70 + t * 220)
    const at = new THREE.Vector3(Math.sin(a) * RING, 1, Math.cos(a) * RING)
    const grp = new THREE.Group()
    grp.position.copy(at)
    grp.rotation.y = a   // the counter faces out of the ring
    root.add(grp)
    box(grp, 3.4, 1.0, 1.3, '#A9784A', 0, 0, 0.6)
    for (const [x, z] of [[-1.6, 0], [1.6, 0], [-1.6, 1.2], [1.6, 1.2]]) box(grp, 0.12, 2.8, 0.12, '#6E4A2C', x, 0, z)
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.0), new THREE.MeshStandardMaterial({ map: stripes(v.color, '#F6F2E8', 9), side: THREE.DoubleSide }))
    aw.rotation.x = -Math.PI / 2 + 0.3
    aw.position.set(0, 2.95, 0.9)
    aw.castShadow = true
    grp.add(aw)
    for (let k = 0; k < 4; k++) box(grp, 0.45, 0.45, 0.45, [v.color, v.trim, '#F2C53D', '#F6EEDC'][k], -1.05 + k * 0.7, 1.0, 0.9)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshStandardMaterial({ map: plaque(v.label) }))
    sign.position.set(0, 3.4, 1.62)
    grp.add(sign)
    stalls.push({ id: v.id, grp, at, facing: a })
  })

  // the Duke's lectern (east): a gilded stand with the order scroll and the Duke's banner
  const duke = new THREE.Group()
  root.add(duke)
  const DX = 14, DZ = -5
  box(duke, 1.6, 2.0, 1.0, '#A9492A', DX, 1, DZ)
  box(duke, 2.0, 0.2, 1.4, '#F2C53D', DX, 3.0, DZ)
  const scroll = box(duke, 1.7, 0.08, 1.1, '#F6EEDC', DX, 3.2, DZ + 0.1)
  scroll.rotation.x = -0.3
  box(duke, 0.5, 0.1, 0.06, '#A9492A', DX, 3.35, DZ + 0.6, false)
  cyl(duke, 0.06, 0.06, 5.4, '#4B5257', DX + 1.6, 1, DZ - 0.4, 5)
  box(duke, 1.5, 2.2, 0.06, '#2A4C9A', DX + 2.4, 4.0, DZ - 0.4, false)
  box(duke, 0.6, 0.6, 0.07, '#F2C53D', DX + 2.4, 5.0, DZ - 0.4, false)

  // in the middle: the plinth for Il Factotum's statue (0.13.0: the engine casts the city's Factotum in bronze)
  const statue = new THREE.Group()
  root.add(statue)
  box(statue, 2.6, 1.8, 2.6, '#F4EBD8', 0, 1, 0)
  box(statue, 3.0, 0.25, 3.0, '#E5D7BC', 0, 2.8, 0)
  box(statue, 1.6, 0.5, 0.06, '#C79A3A', 0, 1.6, 1.32, false)   // the name plate

  // background houses beyond the square, and cypresses
  const houses = ['house_c', 'house_b', 'house_d', 'house_a'] as const
  for (let i = 0; i < 14; i++) {
    const x = -27 + i * 4.1 + (r() - 0.5)
    if (Math.abs(x) < 12) continue
    const id = houses[i % 4]
    const tint = ['#E9B872', '#E39B6B', '#EAA796', '#F1DCB0', '#F3CF78', '#D98C5F'][i % 6]
    if (townPiece(town, id, x, 1, -27, { plaster: tint, scale: Math.min(1, 4.1 / HOUSE_WIDTH[id]), glassMat: flatGlass })) continue
    const h = 6 + r() * 7
    box(town, 3.6, h, 4, ['#F2B98B', '#F3D27A', '#EFA9A0', '#F5F0E4', '#BFE3D9'][i % 5], x, 1, -26 - r() * 2)
    hipRoof(town, 3.9, 4.3, 1.2, i % 2 ? '#C4623A' : '#A9492A', x, 1 + h, -27)
  }
  for (const [x, z] of [[-24, -10], [24, -12], [-25, 6], [25, 7], [-20, 12], [20, 12]]) {
    cyl(town, 0.14, 0.18, 1.2, '#6E4A2C', x, 1, z, 5)
    const c = solid(town, new THREE.ConeGeometry(0.9, 5.2, 7), '#3F6B3A', x, 4.6, z)
    c.scale.x = 0.9
  }

  const picks = new Map<PickId, THREE.Object3D[]>([['hall', [door, hall, frame]], ['statue', [statue]], ['duke', [duke]], ['home', [steps]]])
  for (const st of stalls) picks.set(st.id, [st.grp])
  const highlight = new Map<PickId, THREE.MeshStandardMaterial[]>()
  for (const [id, grp] of [['hall', door], ['statue', statue], ['duke', duke], ['home', steps], ...stalls.map((st) => [st.id, st.grp])] as [PickId, THREE.Group][]) {
    const own = vertexColorMaterial()
    bake(grp, own)
    highlight.set(id, [own])
  }
  for (const g of [hall, frame]) {
    const own = vertexColorMaterial()
    bake(g, own)
    highlight.get('hall')!.push(own)
  }
  bake(town, vc)

  const focus: Partial<Record<PickId, THREE.Vector3>> = {
    hall: new THREE.Vector3(0, 3, HZ + 7), statue: new THREE.Vector3(0, 3, 3), duke: new THREE.Vector3(DX, 2, DZ + 2),
    home: new THREE.Vector3(0, 1, 17), notary: new THREE.Vector3(-12, 2, -10), crier: new THREE.Vector3(-15, 2, -3.4), steward: new THREE.Vector3(14.5, 2, 2.6),
  }
  for (const st of stalls) focus[st.id] = st.at.clone().add(new THREE.Vector3(Math.sin(st.facing) * 2.2, 1, Math.cos(st.facing) * 2.2))
  const labels: Partial<Record<PickId, THREE.Vector3>> = {
    hall: new THREE.Vector3(0, 11.6, HZ + 7.2), statue: new THREE.Vector3(0, 8.6, 0), duke: new THREE.Vector3(DX, 6.6, DZ),
    home: new THREE.Vector3(0, 6, 18.6), notary: new THREE.Vector3(-12, 4.4, -10.6), crier: new THREE.Vector3(-15, 4.6, -4), steward: new THREE.Vector3(14.5, 4.4, 2),
  }
  for (const st of stalls) labels[st.id] = st.at.clone().add(new THREE.Vector3(0, 4.6, 0))

  return {
    root, slots: [], picks, highlight, portrait,
    statue: { at: new THREE.Vector3(0, 3.05, 0), scale: 1.35 },
    paintSign: () => {},
    focusPoint: (id) => (focus[id] ?? new THREE.Vector3(0, 2, 0)).clone(),
    labelPoint: (id) => labels[id] ?? new THREE.Vector3(0, -100, 0),
    npcSpots: [
      { id: 'notary', character: 'notary', at: new THREE.Vector3(-12, 1, -10.6), facing: 0.6 },
      { id: 'crier', character: 'crier', at: new THREE.Vector3(-15, 1, -4), facing: 0.9 },
      { id: 'steward', character: 'steward', at: new THREE.Vector3(14.5, 1, 2), facing: -0.9 },
      // each vendor stands behind their counter, facing out of the ring
      ...stalls.map((st, i) => ({
        id: st.id, character: vendors[i].character, hat: i % 3, facing: st.facing,
        at: st.at.clone().add(new THREE.Vector3(-Math.sin(st.facing) * 0.5, 0, -Math.cos(st.facing) * 0.5)),
      })),
    ],
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

/** An empty cream canvas until the Factotum's portrait is painted in. */
function blankCanvas(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 240
  c.height = 300
  const g = c.getContext('2d')!
  g.fillStyle = '#F6EEDC'
  g.fillRect(0, 0, 240, 300)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A carved plaque (navy with a gold frame) for the hall and the market stalls. */
function plaque(text: string): THREE.CanvasTexture {
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
  g.font = '700 58px "Fraunces Variable", Georgia, serif'
  g.fillText(text, 320, 68)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
