// The Piazza del Palazzo (0.11.0, docs/palazzo.md §3): the shared square up the Steps where all three guilds
// meet. The Palazzo (city hall) stands on the north side with an arcaded loggia, crenellations and a bell tower;
// its door opens the Hall of honor. The Wanted board stands on the west side, the Duke's lectern on the east,
// and a statue of a merchant in the middle. The three officials (notary, crier, steward) are characters the
// engine places at npcSpots. Same walkable area and arrival point as a guild quarter (realtime/src/room.js).
import * as THREE from 'three'
import { GUILDS } from '../guilds'
import { bake, box, cyl, hipRoof, rng, solid, vertexColorMaterial } from './kit'
import type { Quarter } from './quarter'
import type { PickId } from './types'

export function buildPalazzo(): Quarter {
  const root = new THREE.Group()
  root.visible = false
  const r = rng(1499)
  const vc = vertexColorMaterial()
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
    const wx = -8.4 + i * 2.8
    box(hall, 1.2, 2.4, 0.12, '#27444C', wx, 7.4, HZ + 3.52, false)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.8, 4), new THREE.MeshStandardMaterial({ color: '#27444C', flatShading: true }))
    tip.rotation.y = Math.PI / 4
    tip.scale.z = 0.12
    tip.position.set(wx, 10.2, HZ + 3.52)
    hall.add(tip)
  }
  // banners of every guild on poles along the façade (from content: a new guild gets its banner)
  GUILDS.forEach((g, i) => {
    const x = (i - (GUILDS.length - 1) / 2) * 6
    cyl(hall, 0.06, 0.06, 4, '#4B5257', x, 11.8, HZ + 3.7, 5)
    box(hall, 1.4, 2.4, 0.06, g.color, x + 0.74, 13.0, HZ + 3.7, false)
    box(hall, 1.4, 0.3, 0.07, g.trim, x + 0.74, 15.1, HZ + 3.7, false)
  })
  // the bell tower (campanile) with a clock
  const TX = 14
  box(hall, 4.4, 20, 4.4, '#E2B987', TX, 1, HZ - 0.5)
  box(hall, 5.0, 0.4, 5.0, '#F4EBD8', TX, 21, HZ - 0.5)
  for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) box(hall, 0.6, 3.2, 0.6, '#F4EBD8', TX + dx, 21.4, HZ - 0.5 + dz)
  solid(hall, new THREE.SphereGeometry(0.9, 8, 6), '#C79A3A', TX, 22.9, HZ - 0.5)        // the bell
  box(hall, 5.0, 0.4, 5.0, '#D9A877', TX, 24.6, HZ - 0.5)
  hipRoof(hall, 5.0, 5.0, 3.6, '#A9492A', TX, 25, HZ - 0.5)
  cyl(hall, 1.3, 1.3, 0.12, '#F6EEDC', TX, 15.4, HZ + 1.75, 16).rotation.x = Math.PI / 2
  box(hall, 0.1, 1.0, 0.06, '#2B2A33', TX, 15.5, HZ + 1.85, false)
  box(hall, 0.7, 0.1, 0.06, '#2B2A33', TX + 0.3, 15.9, HZ + 1.85, false)

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

  // the Wanted board (west): a big notice board under a little tiled roof, pinned with notices
  const wanted = new THREE.Group()
  root.add(wanted)
  const WX = -14, WZ = -5
  for (const dx of [-2.2, 2.2]) cyl(wanted, 0.16, 0.18, 4.4, '#6E4A2C', WX + dx, 1, WZ, 6)
  box(wanted, 4.8, 2.8, 0.25, '#8F6A35', WX, 2.2, WZ)
  hipRoof(wanted, 5.4, 1.2, 0.8, '#C4623A', WX, 5.3, WZ)
  for (let i = 0; i < 9; i++) {
    const nx = WX - 1.8 + (i % 3) * 1.6 + (r() - 0.5) * 0.3
    const ny = 2.5 + Math.floor(i / 3) * 0.85
    box(wanted, 1.0, 0.7, 0.04, ['#F6EEDC', '#F3E2B8', '#EFE7D6'][i % 3], nx, ny, WZ + 0.15, false)
    box(wanted, 0.1, 0.1, 0.05, '#B83A3A', nx, ny + 0.55, WZ + 0.18, false)
  }
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.8), new THREE.MeshStandardMaterial({ map: plaque('Wanted') }))
    sign.position.set(WX, 5.2, WZ + 0.65)
    wanted.add(sign)
  }

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

  // in the middle: a statue of a merchant on a plinth (Il Factotum, the city's first)
  const statue = new THREE.Group()
  root.add(statue)
  box(statue, 2.4, 1.6, 2.4, '#F4EBD8', 0, 1, 0)
  box(statue, 2.8, 0.25, 2.8, '#E5D7BC', 0, 2.6, 0)
  cyl(statue, 0.55, 0.75, 1.6, '#B79E6E', 0, 2.85, 0, 10)
  solid(statue, new THREE.SphereGeometry(0.52, 10, 8), '#B79E6E', 0, 4.95, 0)
  cyl(statue, 0.6, 0.6, 0.12, '#B79E6E', 0, 5.35, 0, 10)
  cyl(statue, 0.3, 0.36, 0.4, '#B79E6E', 0, 5.45, 0, 10)
  solid(statue, new THREE.SphereGeometry(0.22, 8, 6), '#F2C53D', 0.6, 4.1, 0.35)   // a gilded purse

  // background houses beyond the square, and cypresses
  for (let i = 0; i < 14; i++) {
    const x = -27 + i * 4.1 + (r() - 0.5)
    if (Math.abs(x) < 12) continue
    const h = 6 + r() * 7
    box(town, 3.6, h, 4, ['#F2B98B', '#F3D27A', '#EFA9A0', '#F5F0E4', '#BFE3D9'][i % 5], x, 1, -26 - r() * 2)
    hipRoof(town, 3.9, 4.3, 1.2, i % 2 ? '#C4623A' : '#A9492A', x, 1 + h, -27)
  }
  for (const [x, z] of [[-24, -10], [24, -12], [-25, 6], [25, 7], [-20, 12], [20, 12]]) {
    cyl(town, 0.14, 0.18, 1.2, '#6E4A2C', x, 1, z, 5)
    const c = solid(town, new THREE.ConeGeometry(0.9, 5.2, 7), '#3F6B3A', x, 4.6, z)
    c.scale.x = 0.9
  }

  const picks = new Map<PickId, THREE.Object3D[]>([['hall', [door, hall]], ['wanted', [wanted]], ['duke', [duke]], ['home', [steps]]])
  const highlight = new Map<PickId, THREE.MeshStandardMaterial[]>()
  for (const [id, grp] of [['hall', door], ['wanted', wanted], ['duke', duke], ['home', steps]] as [PickId, THREE.Group][]) {
    const own = vertexColorMaterial()
    bake(grp, own)
    highlight.set(id, [own])
  }
  {
    const own = vertexColorMaterial()
    bake(hall, own)
    highlight.get('hall')!.push(own)
  }
  bake(statue, vc)
  bake(town, vc)

  const focus: Partial<Record<PickId, THREE.Vector3>> = {
    hall: new THREE.Vector3(0, 3, HZ + 7), wanted: new THREE.Vector3(WX, 3, WZ + 2), duke: new THREE.Vector3(DX, 2, DZ + 2),
    home: new THREE.Vector3(0, 1, 17), notary: new THREE.Vector3(-7, 2, -9), crier: new THREE.Vector3(3, 2, 3.6), steward: new THREE.Vector3(10.5, 2, -3),
  }
  const labels: Partial<Record<PickId, THREE.Vector3>> = {
    hall: new THREE.Vector3(0, 9.4, HZ + 7.2), wanted: new THREE.Vector3(WX, 7.2, WZ), duke: new THREE.Vector3(DX, 6.6, DZ),
    home: new THREE.Vector3(0, 6, 18.6), notary: new THREE.Vector3(-7, 4.4, -9.6), crier: new THREE.Vector3(3, 4.6, 3.0), steward: new THREE.Vector3(10.5, 4.4, -3.6),
  }

  return {
    root, slots: [], picks, highlight,
    paintSign: () => {},
    focusPoint: (id) => (focus[id] ?? new THREE.Vector3(0, 2, 0)).clone(),
    labelPoint: (id) => labels[id] ?? new THREE.Vector3(0, -100, 0),
    npcSpots: [
      { id: 'notary', character: 'notary', at: new THREE.Vector3(-7, 1, -9.6), facing: 0.4 },
      { id: 'crier', character: 'crier', at: new THREE.Vector3(3, 1, 3.0), facing: 0.2 },
      { id: 'steward', character: 'steward', at: new THREE.Vector3(10.5, 1, -3.6), facing: -0.5 },
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

/** A carved plaque (navy with a gold frame) for the hall and the Wanted board. */
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
