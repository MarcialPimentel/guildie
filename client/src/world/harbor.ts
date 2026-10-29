// The Portovela harbor: the static town (baked into a few meshes) and the places you can click, each of
// which shows part of the game state (station fill, crafts, customers, listings, the bag, events).
// Layout along the quay (x): Mercato -22 · station -12.5 · stall -8 · bottega -3 · workbench 3.4 ·
// pier 9.5 · storehouse 13 · guild hall 21. The sea is +z, the cliff and town are -z.
import * as THREE from 'three'
import { bake, box, cyl, flat, hipRoof, instanced, rng, signTexture, solid, stripes, vertexColorMaterial } from './kit'
import type { PickId, ProfessionId } from './types'

const C = {
  stone: '#E7D7B9', stoneDark: '#D2BD98', rock: '#D9C29A', rock2: '#C9AE86', grass: '#9DBB6A', pine: '#4F7A3A',
  leaf: '#6E9B48', roof: '#C4623A', roofDark: '#A9492A', wood: '#A9784A', woodDark: '#6E4A2C', teal: '#1F8A87',
  lemon: '#F2C53D', copper: '#C7733E', iron: '#4B5257', ironLight: '#8A9196', cream: '#F6EEDC', white: '#F7F3EA',
  hide: '#C99A6B', hideDark: '#8F5A35',
  plaster: ['#F2B98B', '#F3D27A', '#EFA9A0', '#F5F0E4', '#BFE3D9', '#F6C9A2', '#F5F0E4', '#E9D5F0'],
}

export interface Harbor {
  root: THREE.Group
  /** Clickable things, by place. */
  picks: Map<PickId, THREE.Object3D[]>
  /** Materials to tint when a place is hovered. */
  highlight: Map<PickId, THREE.MeshStandardMaterial[]>
  focusPoint(id: PickId): THREE.Vector3
  labelPoint(id: PickId): THREE.Vector3
  /** Things that change with the game state or over time. */
  live: {
    station: THREE.InstancedMesh[]
    stationCaps: number[]
    stationMarker: THREE.Object3D
    workMarker: THREE.Object3D
    workLight: THREE.PointLight
    workGlow: THREE.MeshStandardMaterial | null
    workAnim: THREE.Object3D | null
    crates: THREE.InstancedMesh
    goods: THREE.InstancedMesh
    /** Where up to three customers wait, with the marker shown over a customer whose order you can fill. */
    customers: { marker: THREE.Object3D; home: THREE.Vector3 }[]
    bunting: THREE.Object3D
    galley: THREE.Group
    gozzo: THREE.Group
    gulls: { group: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; rad: number; h: number; sp: number; ph: number }[]
    particles: THREE.Points
    particleKind: 'sparks' | 'bubbles' | 'dust'
  }
  materials: {
    sea: THREE.MeshStandardMaterial
    foam: THREE.MeshStandardMaterial
    window: THREE.MeshStandardMaterial
    lamp: THREE.MeshStandardMaterial
    door: THREE.MeshStandardMaterial
  }
  lights: { door: THREE.PointLight; pier: THREE.PointLight }
  time: { value: number }
  /** Galley path from open sea (0) to the pier (1). */
  shipCurve: THREE.QuadraticBezierCurve3
}

const STATION_X = -12.5
const WORK_X = 3.4

export function buildHarbor(profession: ProfessionId, playerName: string): Harbor {
  const root = new THREE.Group()
  const r = rng(7)
  const rr = (a: number, b: number) => a + (b - a) * r()
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)]
  const vc = vertexColorMaterial()

  const windowMat = new THREE.MeshStandardMaterial({ color: '#27444C', emissive: '#FFC765', emissiveIntensity: 0, roughness: 0.6, flatShading: true })
  const darkWin = flat('#2B4750')
  const lampMat = new THREE.MeshStandardMaterial({ color: '#FFE7A6', emissive: '#FFC24D', emissiveIntensity: 0.25, flatShading: true })
  const doorMat = new THREE.MeshStandardMaterial({ color: '#4A2E1E', emissive: '#FFB45A', emissiveIntensity: 0.25, flatShading: true })

  // ------------------------------------------------------------ the static town (one bake at the end)
  const town = new THREE.Group()
  root.add(town)
  box(town, 64, 3.2, 10.4, C.stone, 0, -2.2, -1)          // quay, top at y = 1
  box(town, 64, 0.25, 0.7, C.stoneDark, 0, 1, 3.85)
  box(town, 66, 6.2, 9, C.rock, 0, -2.2, -10.5)           // terrace 1, top 4
  box(town, 66, 10.2, 8.5, C.rock2, 0, -2.2, -19)         // terrace 2, top 8
  box(town, 66, 14.2, 8.5, C.rock, 0, -2.2, -27)          // terrace 3, top 12
  box(town, 70, 18.2, 14, C.grass, 0, -2.2, -37.5)        // hill, top 16
  for (let i = 0; i < 6; i++) box(town, 1.8, (i + 1) * 0.5, 0.6, C.stoneDark, 27, 1, -2.9 - i * 0.55)
  for (const x of [-27, -17, -10.5, 6, 16, 25]) cyl(town, 0.25, 0.3, 0.6, C.iron, x, 1, 3.3, 6)
  for (const x of [-16, -5.5, 6.5, 17]) {                 // lamp posts
    cyl(town, 0.08, 0.1, 3, C.iron, x, 1, 3.1, 5)
    box(town, 0.4, 0.5, 0.4, lampMat, x, 4, 3.1, false)
  }

  const house = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    box(town, w, h, d, pick(C.plaster), x, y, z)
    if (r() < 0.5) hipRoof(town, w * 1.08, d * 1.08, rr(1, 1.6), r() < 0.5 ? C.roof : C.roofDark, x, y + h, z)
    else {
      box(town, w + 0.2, 0.35, d + 0.2, C.white, x, y + h, z)
      if (r() < 0.4) box(town, w * 0.5, 1.4, d * 0.5, pick(C.plaster), x - w * 0.15, y + h + 0.35, z - d * 0.1)
    }
    const floors = Math.max(1, Math.floor(h / 1.8))
    const cols = Math.max(1, Math.floor(w / 1.3))
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const wx = x - w / 2 + (c + 0.5) * (w / cols)
      const wy = y + 0.6 + f * 1.75
      box(town, 0.5, 0.75, 0.08, r() < 0.55 ? windowMat : darkWin, wx, wy, z + d / 2 + 0.02, false)
      if (r() < 0.6) {
        box(town, 0.16, 0.75, 0.06, C.teal, wx - 0.36, wy, z + d / 2 + 0.05, false)
        box(town, 0.16, 0.75, 0.06, C.teal, wx + 0.36, wy, z + d / 2 + 0.05, false)
      }
    }
  }
  const row = (y: number, zFront: number, skip: [number, number][]) => {
    let x = -32
    while (x < 31) {
      const w = rr(2.6, 4.4), d = rr(3.2, 4.4), h = rr(2.8, 6)
      if (r() < 0.12 || skip.some(([a, b]) => x + w > a && x < b)) { x += w * 0.6; continue }
      house(x + w / 2, y, zFront - d / 2 - rr(0, 0.6), w, h, d)
      x += w + rr(0.05, 0.5)
    }
  }
  row(4, -6.4, [[25.5, 28.6], [-15, -10]])
  row(8, -15, [[8, 12.2]])
  row(12, -23.2, [[-18, -6]])
  // lemon pergola on terrace 3
  for (let i = 0; i < 4; i++) {
    const lz = -24.5 - i * 1.6
    box(town, 11, 0.9, 0.8, C.leaf, -12, 12, lz)
    for (let k = 0; k < 9; k++) solid(town, new THREE.IcosahedronGeometry(0.16, 0), C.lemon, -17 + k * 1.2 + rr(-0.2, 0.2), 12.6 + rr(0, 0.3), lz + 0.42, false)
  }
  // bell tower with a majolica dome
  box(town, 2.4, 11, 2.4, '#F4EBD8', 10, 8, -17.5)
  box(town, 2.6, 0.3, 2.6, '#E5D7BC', 10, 19, -17.5)
  for (const dx of [-0.6, 0.6]) box(town, 0.5, 1.4, 0.1, '#2B4750', 10 + dx, 16.5, -16.27, false)
  solid(town, new THREE.SphereGeometry(1.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#2F9C8A', 10, 19.3, -17.5)
  solid(town, new THREE.SphereGeometry(0.3, 8, 6), C.lemon, 10, 20.7, -17.5)
  const pine = (x: number, y: number, z: number, s = 1) => {
    cyl(town, 0.14 * s, 0.2 * s, 3.2 * s, C.woodDark, x, y, z, 5)
    const c = solid(town, new THREE.SphereGeometry(1.7 * s, 8, 5), C.pine, x, y + 3.4 * s, z)
    c.scale.y = 0.42
  }
  ;[[-26, -33], [-14, -33], [-6, -35], [4, -32.5], [12, -34], [17, -31], [25, -34], [-20, -38]].forEach(([x, z], i) => pine(x, 16, z, 1 + (i % 3) * 0.15))
  pine(16, 12, -24.5, 0.9)
  // pier
  box(town, 2.8, 0.3, 12.5, C.wood, 9.5, 0.55, 10.2)
  for (let i = 0; i < 6; i++) for (const dx of [-1.3, 1.3]) cyl(town, 0.16, 0.16, 2.4, C.woodDark, 9.5 + dx, -1.2, 4.6 + i * 2.3)
  cyl(town, 0.08, 0.08, 2.4, C.woodDark, 10.6, 0.85, 16)
  box(town, 0.35, 0.45, 0.35, lampMat, 10.6, 3.25, 16, false)

  // ------------------------------------------------------------ places you can click
  const picks = new Map<PickId, THREE.Object3D[]>()
  const highlight = new Map<PickId, THREE.MeshStandardMaterial[]>()
  const place = (id: PickId) => {
    const g = new THREE.Group()
    root.add(g)
    picks.set(id, [...(picks.get(id) ?? []), g])
    return g
  }
  /** Bake a place into its own vertex-colored material, so hovering can tint just that place. */
  const finish = (id: PickId, g: THREE.Group) => {
    const own = vertexColorMaterial()
    bake(g, own)
    highlight.set(id, [...(highlight.get(id) ?? []), own])
  }

  // your bottega (the ledger: recent activity, build, log out)
  const bottega = place('ledger')
  box(bottega, 7.6, 5.4, 4.2, '#F2B98B', -3, 1, -3.6)
  hipRoof(bottega, 8.2, 4.8, 1.8, C.roof, -3, 6.4, -3.6)
  box(bottega, 7.9, 0.25, 4.5, C.white, -3, 6.4, -3.6)
  box(bottega, 2.3, 2.9, 0.1, doorMat, -3, 1, -1.47, false)
  {
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.1, 12, 1, false, 0, Math.PI), doorMat)
    arch.rotation.set(Math.PI / 2, 0, -Math.PI / 2)
    arch.position.set(-3, 3.9, -1.47)
    bottega.add(arch)
  }
  for (const wx of [-5.7, -0.3]) box(bottega, 1.1, 1.5, 0.1, windowMat, wx, 1.6, -1.47, false)
  for (const wx of [-4.8, -1.2]) {
    box(bottega, 1, 1.3, 0.1, windowMat, wx, 4.4, -1.47, false)
    box(bottega, 0.4, 1.3, 0.08, C.teal, wx - 0.75, 4.4, -1.42, false)
    box(bottega, 0.4, 1.3, 0.08, C.teal, wx + 0.75, 4.4, -1.42, false)
  }
  box(bottega, 4.6, 0.15, 0.9, C.white, -3, 4.1, -1.05)
  for (let i = 0; i < 7; i++) box(bottega, 0.07, 0.6, 0.07, C.iron, -5.1 + i * 0.7, 4.25, -0.65, false)
  box(bottega, 4.6, 0.07, 0.07, C.iron, -3, 4.85, -0.65, false)
  for (let i = 0; i < 4; i++) solid(bottega, new THREE.SphereGeometry(0.22, 6, 4), '#D7457A', -4.6 + i * 1.1, 4.4, -0.85, false)
  {
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), new THREE.MeshStandardMaterial({ map: stripes('#1F8A87', '#F6F2E8', 10), side: THREE.DoubleSide }))
    aw.rotation.x = -Math.PI / 2 + 0.55
    aw.position.set(-3, 3.75, -0.95)
    aw.castShadow = true
    bottega.add(aw)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshStandardMaterial({ map: signTexture(`Bottega di ${playerName}`) }))
    sign.position.set(-3, 5.7, -1.44)
    bottega.add(sign)
  }
  box(bottega, 0.35, 0.5, 0.35, lampMat, -1.3, 3.2, -1.3, false)
  cyl(bottega, 0.55, 0.4, 0.8, C.roof, -6.4, 1, -0.6, 10)          // lemon tree in a pot
  cyl(bottega, 0.08, 0.1, 1.2, C.woodDark, -6.4, 1.8, -0.6, 5)
  solid(bottega, new THREE.IcosahedronGeometry(0.9, 0), C.leaf, -6.4, 3.3, -0.6)
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9
    solid(bottega, new THREE.IcosahedronGeometry(0.13, 0), C.lemon, -6.4 + Math.cos(a) * 0.8, 3.1 + (i % 3) * 0.25, -0.6 + Math.sin(a) * 0.8, false)
  }
  finish('ledger', bottega)
  const doorLight = new THREE.PointLight('#FFB45A', 0, 9, 2)
  doorLight.position.set(-1.3, 3.2, -0.8)
  root.add(doorLight)
  const pierLight = new THREE.PointLight('#FFB45A', 0, 10, 2)
  pierLight.position.set(10.6, 3.4, 16.4)
  root.add(pierLight)

  // the gathering station (one per profession)
  const station = place('station')
  const stationSets: THREE.InstancedMesh[] = []
  const stationCaps: number[] = []
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.9, flatShading: true })
  if (profession === 'blacksmith') {
    box(station, 2.8, 2.8, 0.2, '#2A2420', STATION_X, 1, -5.95, false)
    box(station, 0.35, 3.1, 0.4, C.woodDark, STATION_X - 1.5, 1, -5.8)
    box(station, 0.35, 3.1, 0.4, C.woodDark, STATION_X + 1.5, 1, -5.8)
    box(station, 3.5, 0.4, 0.5, C.woodDark, STATION_X, 4, -5.8)
    for (const dx of [-0.45, 0.45]) box(station, 0.1, 0.08, 4.4, C.iron, STATION_X + dx, 1, -3.6, false)
    for (let i = 0; i < 6; i++) box(station, 1.4, 0.06, 0.2, C.woodDark, STATION_X, 0.99, -5.4 + i * 0.75, false)
    const g = new THREE.CylinderGeometry(0.95, 0.7, 0.9, 4, 1)
    g.rotateY(Math.PI / 4)
    const cart = solid(station, g, '#7A6A5C', STATION_X, 1.75, -3.2)
    cart.scale.set(1.25, 1, 1.5)
    for (const [x, z] of [[-0.6, -0.7], [0.6, -0.7], [-0.6, 0.7], [0.6, 0.7]]) {
      const w = solid(station, new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), C.iron, STATION_X + x, 1.22, -3.2 + z)
      w.rotation.z = Math.PI / 2
    }
    const spots = (n: number, y0: number) => Array.from({ length: n }, (_, i) => new THREE.Vector3(STATION_X + rr(-0.6, 0.6), y0 + Math.floor(i / 5) * 0.22 + rr(0, 0.1), -3.2 + rr(-0.8, 0.8)))
    stationSets.push(instanced(station, new THREE.IcosahedronGeometry(0.26, 0), flat(C.copper), spots(10, 2.25), { rotY: (i) => i }))
    stationSets.push(instanced(station, new THREE.IcosahedronGeometry(0.24, 0), flat(C.ironLight), spots(6, 2.55), { rotY: (i) => i * 2 }))
  } else if (profession === 'alchemist') {
    for (const dx of [-1.4, 1.4]) {
      box(station, 2.4, 0.7, 2.2, '#B9A27E', STATION_X + dx, 1, -3.4)
      box(station, 2.1, 0.12, 1.9, '#6B4A2E', STATION_X + dx, 1.7, -3.4, false)
    }
    // a lemon-tree arch over the beds
    for (const dx of [-2.9, 2.9]) box(station, 0.2, 3.4, 0.2, C.woodDark, STATION_X + dx, 1, -4.6)
    box(station, 6.2, 0.2, 0.3, C.woodDark, STATION_X, 4.4, -4.6)
    for (let i = 0; i < 6; i++) solid(station, new THREE.IcosahedronGeometry(0.5, 0), C.leaf, STATION_X - 2.5 + i, 4.6, -4.6)
    for (let i = 0; i < 5; i++) solid(station, new THREE.IcosahedronGeometry(0.14, 0), C.lemon, STATION_X - 2 + i, 4.25, -4.4, false)
    const bed = (dx: number, n: number) => Array.from({ length: n }, (_, i) => new THREE.Vector3(STATION_X + dx - 0.75 + (i % 4) * 0.5, 1.82, -3.4 - 0.6 + Math.floor(i / 4) * 0.55))
    const leaf = new THREE.ConeGeometry(0.22, 0.7, 5)
    leaf.translate(0, 0.35, 0)
    stationSets.push(instanced(station, leaf, whiteMat, bed(-1.4, 12), { colors: (i) => (i % 3 ? '#6E9B48' : '#F2C53D'), scale: (i) => new THREE.Vector3(1, 0.8 + (i % 3) * 0.2, 1) }))
    const moss = new THREE.IcosahedronGeometry(0.3, 0)
    moss.scale(1, 0.5, 1)
    stationSets.push(instanced(station, moss, flat('#D9663A'), bed(1.4, 8), { rotY: (i) => i }))
  } else {
    for (const dx of [-1.6, 1.6]) {
      box(station, 0.2, 3.2, 0.2, C.woodDark, STATION_X + dx - 1.1, 1, -3.4)
      box(station, 0.2, 3.2, 0.2, C.woodDark, STATION_X + dx + 1.1, 1, -3.4)
      box(station, 2.5, 0.16, 0.16, C.woodDark, STATION_X + dx, 4.1, -3.4)
    }
    box(station, 6, 0.25, 2.6, C.roofDark, STATION_X, 4.6, -4.4)   // a little shelter roof
    for (const dx of [-2.9, 2.9]) box(station, 0.2, 3.6, 0.2, C.woodDark, STATION_X + dx, 1, -5.5)
    const rack = (dx: number, n: number) => Array.from({ length: n }, (_, i) => new THREE.Vector3(STATION_X + dx - 0.8 + i * (1.6 / Math.max(1, n - 1)), 3.1, -3.4 + (i % 2) * 0.12))
    const hide = new THREE.BoxGeometry(0.55, 1.8, 0.06)
    stationSets.push(instanced(station, hide, flat(C.hide), rack(-1.6, 5), { rotY: (i) => (i % 2 ? 0.15 : -0.15) }))
    stationSets.push(instanced(station, new THREE.BoxGeometry(0.7, 1.9, 0.08), flat(C.hideDark), rack(1.6, 4), { rotY: (i) => (i % 2 ? -0.12 : 0.12) }))
  }
  stationCaps.push(...stationSets.map((s) => s.instanceMatrix.count))
  const stationMarker = marker(root, new THREE.Vector3(STATION_X, 5.8, -3.6), '#E07A5F')
  finish('station', station)

  // the workbench (forge, alembic or tanning bench) under a lean-to roof
  const work = place('workbench')
  box(work, 4.2, 0.25, 3.4, C.roof, WORK_X + 0.2, 5.1, -2.5)
  for (const [x, z] of [[WORK_X - 1.7, -1.0], [WORK_X + 2.1, -1.0], [WORK_X + 2.1, -4.0]]) box(work, 0.25, 4.1, 0.25, C.woodDark, x, 1, z)
  let workGlow: THREE.MeshStandardMaterial | null = null
  let workAnim: THREE.Object3D | null = null
  let lightColor = '#FF8A3D'
  let particleKind: 'sparks' | 'bubbles' | 'dust' = 'sparks'
  if (profession === 'blacksmith') {
    box(work, 2.4, 1.3, 2, '#8E8378', WORK_X, 1, -2.6)
    workGlow = new THREE.MeshStandardMaterial({ color: '#3A1A0A', emissive: '#FF6A1A', emissiveIntensity: 0.4, flatShading: true })
    box(work, 1.9, 0.14, 1.5, workGlow, WORK_X, 2.3, -2.6, false)
    box(work, 1, 5.6, 1, '#7C7167', WORK_X, 2.3, -3.4)
    box(work, 1.9, 0.6, 1.7, '#6E655C', WORK_X, 3.9, -2.9)
    box(work, 0.9, 0.5, 1.2, '#7A4E2D', WORK_X - 1.45, 1.3, -2.6)
    cyl(work, 0.38, 0.42, 0.8, C.woodDark, WORK_X + 2, 1, -0.5, 8)
    box(work, 1.1, 0.35, 0.5, C.iron, WORK_X + 2, 1.8, -0.5)
    const horn = solid(work, new THREE.ConeGeometry(0.2, 0.55, 6), C.iron, WORK_X + 2.8, 1.98, -0.5)
    horn.rotation.z = -Math.PI / 2
  } else if (profession === 'alchemist') {
    lightColor = '#7FE0C8'
    particleKind = 'bubbles'
    box(work, 3, 1.1, 1.5, C.wood, WORK_X, 1, -2.6)                 // table
    cyl(work, 0.45, 0.55, 0.5, '#3B3633', WORK_X - 0.8, 2.1, -2.6, 8)  // brazier
    workGlow = new THREE.MeshStandardMaterial({ color: '#5A2A0A', emissive: '#FF8A2A', emissiveIntensity: 0.4, flatShading: true })
    const flame = solid(work, new THREE.ConeGeometry(0.3, 0.7, 6), workGlow, WORK_X - 0.8, 2.95, -2.6, false)
    flame.userData.keep = true
    workAnim = flame
    cyl(work, 0.5, 0.42, 0.8, C.copper, WORK_X - 0.8, 2.6, -2.6, 10)   // copper still
    cyl(work, 0.12, 0.3, 0.6, C.copper, WORK_X - 0.8, 3.4, -2.6, 8)
    const tube = solid(work, new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), C.copper, WORK_X, 3.5, -2.6)
    tube.rotation.z = Math.PI / 2.6
    const glass = new THREE.MeshStandardMaterial({ color: '#9FE6DA', roughness: 0.15, transparent: true, opacity: 0.65 })
    solid(work, new THREE.SphereGeometry(0.42, 12, 10), glass, WORK_X + 0.85, 2.55, -2.6, false)
    box(work, 3.2, 0.12, 0.6, C.woodDark, WORK_X, 3.6, -3.9)        // shelf of jars
    for (let i = 0; i < 5; i++) cyl(work, 0.16, 0.16, 0.42, ['#2FB59D', '#F2C53D', '#D9663A', '#2A4C9A', '#8F5A2B'][i], WORK_X - 1.2 + i * 0.6, 3.72, -3.9, 8)
  } else {
    lightColor = '#FFC27A'
    particleKind = 'dust'
    box(work, 3, 1.1, 1.4, C.wood, WORK_X, 1, -2.6)                 // bench
    box(work, 1.6, 0.08, 1, C.hide, WORK_X - 0.4, 2.1, -2.6, false)  // leather on the bench
    for (const dx of [-1.4, 1.4]) box(work, 0.12, 2.6, 0.12, C.woodDark, WORK_X + dx, 2.1, -3.6)
    box(work, 2.9, 0.12, 0.12, C.woodDark, WORK_X, 4.6, -3.6)
    box(work, 2.4, 2, 0.06, C.hideDark, WORK_X, 2.4, -3.6)          // a hide stretched on a frame
    cyl(work, 0.75, 0.65, 1.1, C.woodDark, WORK_X + 2.2, 1, -1.6, 10) // tanning vat
    cyl(work, 0.68, 0.68, 0.05, '#5A3A1E', WORK_X + 2.2, 2.08, -1.6, 10)
    const mallet = new THREE.Group()
    mallet.userData.keep = true
    mallet.position.set(WORK_X + 0.7, 2.2, -2.3)
    box(mallet, 0.08, 0.7, 0.08, C.woodDark, 0, 0, 0)
    box(mallet, 0.35, 0.22, 0.22, '#B07A4A', 0, 0.62, 0)
    work.add(mallet)
    workAnim = mallet
  }
  const workLight = new THREE.PointLight(lightColor, 3, 10, 2)
  workLight.position.set(WORK_X, 3, -1.6)
  root.add(workLight)
  const workMarker = marker(root, new THREE.Vector3(WORK_X, 6.4, -2.5), '#F2C53D')
  finish('workbench', work)

  // your market stall: one good on the counter per active listing
  const stall = place('stall')
  box(stall, 3.2, 0.95, 1.3, C.wood, -8.2, 1, 1.9)
  for (const [x, z] of [[-9.7, 1.3], [-6.7, 1.3], [-9.7, 2.5], [-6.7, 2.5]]) box(stall, 0.12, 2.6, 0.12, C.woodDark, x, 1, z)
  {
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.9), new THREE.MeshStandardMaterial({ map: stripes('#C4623A', '#F6F2E8', 9), side: THREE.DoubleSide }))
    aw.rotation.x = -Math.PI / 2 + 0.25
    aw.position.set(-8.2, 3.75, 1.9)
    aw.castShadow = true
    stall.add(aw)
  }
  const goods = instanced(stall, new THREE.BoxGeometry(0.42, 0.42, 0.42), whiteMat,
    Array.from({ length: 6 }, (_, i) => new THREE.Vector3(-9.3 + (i % 3) * 1.1, 2.16 + Math.floor(i / 3) * 0.44, 1.75 + (i % 2) * 0.2)),
    { colors: (i) => ['#F2C53D', '#2FB59D', '#C7733E', '#B5683A', '#2A4C9A', '#EFA9A0'][i], rotY: (i) => i * 0.4 })
  finish('stall', stall)

  // where customers wait at the door (the order board). The customers themselves are blobs the engine
  // walks in and out (0.10.0); here are their spots and the lemon "ready to fill" marker over each.
  const customers: Harbor['live']['customers'] = []
  ;[[-4.7, 0.9], [-3, 1.25], [-1.3, 0.9]].forEach(([x, z]) => {
    const g = new THREE.Group()
    g.position.set(x, 1, z)
    root.add(g)
    const m = marker(g, new THREE.Vector3(0, 3.55, 0), '#F2C53D')
    customers.push({ marker: m, home: new THREE.Vector3(x, 1, z) })
  })

  // the storehouse: one crate outside per kind of item in your bag
  const store = place('bag')
  box(store, 5.2, 4.2, 4, '#E9D5B5', 13, 1, -3.8)
  hipRoof(store, 5.8, 4.6, 1.6, C.roofDark, 13, 5.2, -3.8)
  box(store, 2.2, 2.8, 0.1, '#5A3A22', 13, 1, -1.77, false)
  box(store, 0.2, 2.8, 0.14, C.woodDark, 13, 1, -1.72, false)
  box(store, 3, 0.3, 0.4, C.woodDark, 13, 4.3, -1.7)
  const crates = instanced(store, new THREE.BoxGeometry(0.8, 0.8, 0.8), whiteMat,
    Array.from({ length: 10 }, (_, i) => new THREE.Vector3(10.2 + (i % 4) * 0.9 + (i >= 8 ? 0.45 : 0), 1.4 + Math.floor(i / 4) * 0.8, -0.8 + (i % 2) * 0.15)),
    { colors: (i) => (i % 3 === 0 ? '#B9824F' : i % 3 === 1 ? '#A9784A' : '#C49260'), rotY: (i) => (i % 3) * 0.2 - 0.2 })
  finish('bag', store)

  // the Mercato: a loggia with arches and banners
  const mercato = place('mercato')
  const MX = -22
  box(mercato, 10, 0.3, 6, C.stoneDark, MX, 1, -3)
  box(mercato, 10, 5.2, 0.5, '#F4EBD8', MX, 1.3, -5.8)
  for (let i = 0; i < 5; i++) cyl(mercato, 0.3, 0.34, 4.2, '#F4EBD8', MX - 4.4 + i * 2.2, 1.3, -0.4, 10)
  box(mercato, 10.2, 0.9, 0.8, '#E5D7BC', MX, 5.5, -0.4)
  for (const dx of [-4.4, 4.4]) box(mercato, 0.5, 4.2, 5.4, '#F4EBD8', MX + dx, 1.3, -3.2)
  hipRoof(mercato, 11, 6.6, 2, C.roof, MX, 6.4, -3)
  box(mercato, 11, 0.3, 6.6, C.white, MX, 6.4, -3)
  for (let i = 0; i < 4; i++) box(mercato, 0.9, 1.6, 0.06, i % 2 ? '#1F8A87' : '#F2C53D', MX - 3.3 + i * 2.2, 3.7, -0.15, false)
  for (const dx of [-2.2, 2.2]) {
    box(mercato, 2.6, 0.9, 1.2, C.wood, MX + dx, 1.3, -3.2)
    for (let k = 0; k < 4; k++) box(mercato, 0.4, 0.4, 0.4, ['#F2C53D', '#2FB59D', '#C7733E', '#EFA9A0'][k], MX + dx - 0.9 + k * 0.6, 2.2, -3.2)
  }
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshStandardMaterial({ map: signTexture('Mercato') }))
    sign.position.set(MX, 5.95, 0.02)
    mercato.add(sign)
  }
  finish('mercato', mercato)

  // the guild hall: players, profiles and trades
  const hall = place('city')
  const HX = 21
  box(hall, 8, 6.4, 5, '#EFD9B5', HX, 1, -3.6)
  hipRoof(hall, 8.6, 5.6, 2, C.roof, HX, 7.4, -3.6)
  box(hall, 2.6, 4, 2.6, '#EFD9B5', HX + 2.2, 7.4, -4.4)
  hipRoof(hall, 3, 3, 1.6, C.roofDark, HX + 2.2, 11.4, -4.4)
  box(hall, 2.6, 3.6, 0.1, doorMat, HX, 1, -1.07, false)
  for (const dx of [-2.6, 2.6]) {
    box(hall, 1.2, 1.8, 0.1, windowMat, HX + dx, 2, -1.07, false)
    box(hall, 1.2, 1.8, 0.1, windowMat, HX + dx, 4.6, -1.07, false)
  }
  for (const dx of [-1.6, 1.6]) {
    box(hall, 1, 2.6, 0.06, '#1F8A87', HX + dx, 4.2, -1.0, false)
    box(hall, 0.5, 0.5, 0.07, '#F2C53D', HX + dx, 5.4, -0.98, false)
  }
  box(hall, 4, 0.3, 1.4, C.stoneDark, HX, 1, -0.4)
  finish('city', hall)

  // the Duke's notice board by the storehouse (0.9.0): the city-wide order. A herald blob stands beside it.
  const duke = place('duke')
  for (const dx of [-1.1, 1.1]) box(duke, 0.16, 2.6, 0.16, C.woodDark, 17.6 + dx, 1, 0.2)
  box(duke, 2.6, 1.7, 0.14, '#6E4A2C', 17.6, 2.0, 0.2)
  box(duke, 2.3, 1.4, 0.05, C.cream, 17.6, 2.15, 0.29, false)
  box(duke, 2.8, 0.22, 0.4, C.roof, 17.6, 3.7, 0.2)
  box(duke, 0.6, 0.16, 0.06, '#A9492A', 17.6, 3.2, 0.33, false)
  for (let i = 0; i < 4; i++) box(duke, 1.5 - i * 0.18, 0.06, 0.02, '#4A6B6F', 17.6, 2.45 + i * 0.25, 0.33, false)
  box(duke, 0.5, 1.6, 0.05, '#2A4C9A', 16.0, 2.6, 0.2, false)
  box(duke, 0.5, 0.3, 0.05, '#F2C53D', 16.0, 4.2, 0.2, false)
  finish('duke', duke)

  // the Steps up to the guild quarters (0.9.0): an arch with a sign over the stairs at the east end
  const stepsUp = place('steps')
  for (const dx of [-1.5, 1.5]) box(stepsUp, 0.5, 4.2, 0.5, '#F4EBD8', 27 + dx, 1, -1.4)
  box(stepsUp, 3.6, 0.6, 0.6, '#F4EBD8', 27, 5.2, -1.4)
  solid(stepsUp, new THREE.SphereGeometry(0.35, 8, 6), C.lemon, 27, 6.1, -1.4)
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ map: signTexture('To the quarters') }))
    sign.position.set(27, 4.6, -1.08)
    stepsUp.add(sign)
  }
  finish('steps', stepsUp)

  // ------------------------------------------------------------ boats, gulls, bunting
  const sailMat = new THREE.MeshStandardMaterial({ color: C.cream, side: THREE.DoubleSide, flatShading: true })
  const makeShip = (L: number, W: number, hull: string, band: string, sails: { x: number; h: number; a: number; b: number }[]) => {
    const ship = new THREE.Group()
    const inner = new THREE.Group()
    ship.add(inner)
    const shape = new THREE.Shape()
    shape.moveTo(-L * 0.45, -W * 0.45)
    shape.lineTo(L * 0.2, -W * 0.5)
    shape.quadraticCurveTo(L * 0.45, -W * 0.42, L * 0.55, 0)
    shape.quadraticCurveTo(L * 0.45, W * 0.42, L * 0.2, W * 0.5)
    shape.lineTo(-L * 0.45, W * 0.45)
    shape.quadraticCurveTo(-L * 0.52, 0, -L * 0.45, -W * 0.45)
    const part = (sx: number, depth: number, color: string, y: number) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 })
      g.rotateX(-Math.PI / 2)
      g.scale(sx, 1, sx)
      solid(inner, g, color, 0, y, 0)
    }
    part(1, 1.0, hull, -0.6)
    part(1.01, 0.32, band, 0.35)
    part(0.92, 0.1, '#C89A64', 0.62)
    for (const s of sails) {
      cyl(inner, 0.07, 0.09, s.h, C.woodDark, s.x, 0.7, 0, 6)
      const rig = new THREE.Group()
      rig.position.x = s.x
      rig.rotation.y = 0.6
      inner.add(rig)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([s.a, 1.3, 0.08, -s.b, 0.7 + s.h, 0.08, -s.b * 0.3, 1.2, 0.08], 3))
      g.computeVertexNormals()
      rig.add(new THREE.Mesh(g, sailMat))
      const yard = cyl(rig, 0.04, 0.04, Math.hypot(s.a + s.b, s.h - 0.6), C.woodDark, 0, 0, 0, 5)
      yard.position.set((s.a - s.b) / 2, 1.0 + s.h / 2, 0.12)
      yard.rotation.z = Math.atan2(s.a + s.b, s.h - 0.6)
    }
    bake(inner, vc)
    inner.traverse((o) => { o.castShadow = false })
    root.add(ship)
    return ship
  }
  const galley = makeShip(8, 2.4, '#7A4E2D', '#1F8A87', [{ x: 1, h: 6.5, a: 2.8, b: 2.2 }, { x: -2, h: 4.8, a: 2, b: 1.6 }])
  picks.set('news', [galley])
  const gozzo = makeShip(3.4, 1.3, '#F5F0E4', '#1F8A87', [])
  gozzo.position.set(12.5, 0, 9)
  gozzo.rotation.y = -Math.PI / 2 + 0.1

  const gulls: Harbor['live']['gulls'] = []
  const wingMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', side: THREE.DoubleSide, flatShading: true })
  const wingGeo = new THREE.BufferGeometry()
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.15, 0, 0, 0.15, 0.9, 0, 0], 3))
  wingGeo.computeVertexNormals()
  for (let i = 0; i < 4; i++) {
    const group = new THREE.Group()
    const l = new THREE.Mesh(wingGeo, wingMat)
    const rw = new THREE.Mesh(wingGeo, wingMat)
    rw.rotation.y = Math.PI
    group.add(l, rw)
    root.add(group)
    gulls.push({ group, l, r: rw, rad: rr(10, 20), h: rr(11, 15), sp: rr(0.15, 0.26) * (i % 2 ? 1 : -1), ph: r() * 6.28 })
  }

  const bunting = new THREE.Group()
  {
    const tri = new THREE.BufferGeometry()
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.25, 0, 0, 0.25, 0, 0, 0, -0.55, 0], 3))
    tri.computeVertexNormals()
    const flagMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', side: THREE.DoubleSide, flatShading: true })
    const spots: THREE.Vector3[] = []
    const posts = [-16, -5.5, 6.5, 17]
    for (let p = 0; p < posts.length - 1; p++) {
      for (let k = 1; k < 14; k++) {
        const t = k / 14
        spots.push(new THREE.Vector3(posts[p] + (posts[p + 1] - posts[p]) * t, 4.3 - Math.sin(t * Math.PI) * 0.7, 3.1))
      }
    }
    const flags = instanced(bunting, tri, flagMat, spots, { colors: (i) => ['#1F8A87', '#F2C53D', '#C4623A', '#F6F2E8'][i % 4] })
    flags.count = spots.length
    flags.castShadow = false
    bunting.visible = false
    root.add(bunting)
  }

  // particles for the workbench (sparks, bubbles or dust)
  const PARTICLES = 48
  const pGeo = new THREE.BufferGeometry()
  pGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PARTICLES * 3).fill(-99), 3))
  const pColor = particleKind === 'sparks' ? '#FFC24D' : particleKind === 'bubbles' ? '#BFF5EA' : '#E6C49C'
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: pColor, size: particleKind === 'bubbles' ? 0.16 : 0.2, transparent: true, opacity: 0.9, depthWrite: false }))
  particles.frustumCulled = false
  root.add(particles)

  // ------------------------------------------------------------ sea (waves run on the GPU)
  const time = { value: 0 }
  const seaGeo = new THREE.PlaneGeometry(320, 320, 96, 96)
  seaGeo.rotateX(-Math.PI / 2)
  {
    const pos = seaGeo.attributes.position
    const cols: number[] = []
    const shallow = new THREE.Color('#86D8CC'), deep = new THREE.Color('#1F8F8D'), far = new THREE.Color('#17707A'), c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const edge = THREE.MathUtils.smoothstep(Math.abs(x), 30, 50)
      const k = Math.min(1, THREE.MathUtils.smoothstep(z, 4, 26) * (1 - edge) + edge)
      c.copy(shallow).lerp(deep, k).lerp(far, THREE.MathUtils.smoothstep(Math.hypot(x, z), 70, 150))
      cols.push(c.r, c.g, c.b)
    }
    seaGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  }
  const seaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.05, flatShading: true })
  seaMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.y += 0.1 * (sin(position.x * 0.22 + uTime * 1.1) + 0.8 * sin(position.z * 0.31 - uTime * 0.8)
                       + 0.5 * sin((position.x + position.z) * 0.13 + uTime * 0.6));`,
    )
  }
  const sea = new THREE.Mesh(seaGeo, seaMat)
  sea.receiveShadow = true
  root.add(sea)
  const foamMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.6 })
  const foam = new THREE.Mesh(new THREE.BoxGeometry(64, 0.08, 0.5), foamMat)
  foam.position.set(0, 0.06, 4.3)
  root.add(foam)

  // bake the static town last (one vertex-colored mesh + one per special material)
  bake(town, vc)

  // ------------------------------------------------------------ focus and label points
  const shipCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(22, 0, 21), new THREE.Vector3(14, 0, 24), new THREE.Vector3(5.3, 0, 11.5))
  const focus: Partial<Record<PickId, THREE.Vector3>> = {
    duke: new THREE.Vector3(17.6, 2, 0.4), steps: new THREE.Vector3(27, 2, -1.2),
    station: new THREE.Vector3(STATION_X, 2, -3.5), workbench: new THREE.Vector3(WORK_X, 2.2, -2.4),
    orders: new THREE.Vector3(-3, 1.5, 0.6), ledger: new THREE.Vector3(-3, 3, -3), bag: new THREE.Vector3(12.5, 2.5, -2.6),
    stall: new THREE.Vector3(-8.2, 1.8, 1.9), mercato: new THREE.Vector3(MX, 3, -3), city: new THREE.Vector3(HX, 4, -3.4),
    news: new THREE.Vector3(),
  }
  const labels: Partial<Record<PickId, THREE.Vector3>> = {
    duke: new THREE.Vector3(17.6, 5.4, 0.2), steps: new THREE.Vector3(27, 7.3, -1.4),
    station: new THREE.Vector3(STATION_X, profession === 'blacksmith' ? 4.9 : 5.4, -3.8), workbench: new THREE.Vector3(WORK_X, 5.9, -2.2),
    orders: new THREE.Vector3(-2.6, 3.7, 1.2), ledger: new THREE.Vector3(-3, 8.7, -3.6), bag: new THREE.Vector3(13, 7.4, -3.6),
    stall: new THREE.Vector3(-8.2, 4.4, 1.9), mercato: new THREE.Vector3(MX, 9, -3), city: new THREE.Vector3(HX, 13.6, -3.6),
    news: new THREE.Vector3(),
  }

  return {
    root, picks, highlight,
    focusPoint: (id) => (id === 'news' ? galley.position.clone().setY(2) : (focus[id] ?? new THREE.Vector3()).clone()),
    labelPoint: (id) => (id === 'news' ? galley.position.clone().setY(8.4) : labels[id] ?? new THREE.Vector3(0, -100, 0)),
    live: {
      station: stationSets, stationCaps, stationMarker, workMarker, workLight, workGlow, workAnim, crates, goods, customers, bunting,
      galley, gozzo, gulls, particles, particleKind,
    },
    materials: { sea: seaMat, foam: foamMat, window: windowMat, lamp: lampMat, door: doorMat },
    lights: { door: doorLight, pier: pierLight },
    time, shipCurve,
  }
}

/** A small spinning gem that floats over something that needs you (ready crafts, a full station). */
function marker(parent: THREE.Object3D, at: THREE.Vector3, color: string): THREE.Object3D {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.35, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, flatShading: true }),
  )
  m.position.copy(at)
  m.userData.keep = true
  m.userData.baseY = at.y
  m.castShadow = false
  m.visible = false
  parent.add(m)
  return m
}
