// The 3D world engine: renderer, camera, mouse and keyboard, picking, floating labels, day/night and the
// animation loop, for two kinds of scene: your harbor quay and a guild quarter (0.9.0). Loaded on demand
// (dynamic import) so phones and the classic view never download it.
//
// Kept light for browsers: the static town is baked into a few meshes (see kit.ts bake), the sea's waves
// run on the GPU, shadows are drawn once and only redrawn when the static scene changes (blobs use cheap
// ground discs), the frame rate drops to 30 when nothing is moving, the pixel ratio adapts to how fast the
// machine is, and nothing renders while the tab is hidden.
//
// The engine decides nothing about the game: it draws what the UI hands it (world/types.ts) and reports
// clicks and your merchant's position. Other players' positions come from the realtime room via the UI.
import * as THREE from 'three'
import { Blob, Glove, type Dress } from './blobs'
import { buildHarbor, type Harbor } from './harbor'
import { buildQuarter, QUARTER_BOUNDS, QUARTER_SPAWN, type Quarter } from './quarter'
import type { Peer, PickId, ProfessionId, Scene, StallInfo, WorldCallbacks, WorldEngine, WorldLabel, WorldState } from './types'

const HARBOR_PICKS: PickId[] = ['station', 'workbench', 'orders', 'ledger', 'bag', 'stall', 'mercato', 'city', 'news', 'duke', 'steps']
const QUARTER_PICKS: PickId[] = ['duke', 'trainer', 'home']

const DAY = { sky: '#BFE6EA', hemiSky: '#E6F7F7', hemiGround: '#E8D3B0', hemi: 1.3, sun: 2.4, sunCol: '#FFF0D2', sea: '#FFFFFF', win: 0, lamp: 0.25, lampLight: 0, door: 0.25 }
const NIGHT = { sky: '#0F2B3A', hemiSky: '#3C6585', hemiGround: '#1B2B33', hemi: 0.55, sun: 0.55, sunCol: '#9FB8E8', sea: '#3E6F86', win: 1.6, lamp: 2.4, lampLight: 14, door: 1.2 }

const HARBOR_WALK = { minX: -30, maxX: 30, minZ: -1.0, maxZ: 3.6 }
const HARBOR_SPAWN = new THREE.Vector3(-3, 1, 0.4)
const WALK_SPEED = 5
const SEND_EVERY_MS = 200

interface Tween { t: number; dur: number; fn: (k: number) => void; done?: () => void }
type Hit = { kind: 'place'; id: PickId } | { kind: 'player'; id: number }

interface Walker {
  blob: Blob
  pos: THREE.Vector3
  target: THREE.Vector3 | null
  speed: number
  heading: number
  /** How fast it moved last frame (for the walk animation). */
  moved: number
}

interface PeerState extends Walker { peer: Peer; label: Label }
interface Npc extends Walker { pause: number; area: { minX: number; maxX: number; minZ: number; maxZ: number } }

interface Label {
  el: HTMLButtonElement
  visible: boolean
  width: number
  point: () => THREE.Vector3
  /** Place labels avoid each other; people's labels just float. */
  place: boolean
}

declare global {
  interface Window {
    /** Read-only hooks for the browser test and for checking performance (?debug=1 shows them on screen). */
    __guildieWorld?: {
      ready: boolean
      screenPoint(id: PickId): { x: number; y: number } | null
      screenPointPlayer(id: number): { x: number; y: number } | null
      screenPointStall(slot: number): { x: number; y: number } | null
      me(): { x: number; z: number; scene: Scene }
      peers(): number[]
      peer(id: number): { x: number; z: number } | null
      lastSlap: { from: number; to: number } | null
      stats(): Record<string, number>
    }
  }
}

export function createWorld(container: HTMLElement, profession: ProfessionId, playerName: string, cb: WorldCallbacks): WorldEngine {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const canvas = document.createElement('canvas')
  canvas.className = 'world-canvas'
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', 'The Portovela harbor. Use the buttons or the labels to open each place. Arrow keys or WASD walk your merchant.')
  container.prepend(canvas)
  const labelLayer = document.createElement('div')
  labelLayer.className = 'world-labels'
  container.appendChild(labelLayer)
  const fade = document.createElement('div')
  fade.className = 'world-fade'
  container.appendChild(fade)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  const maxDpr = Math.min(window.devicePixelRatio || 1, 2)
  let dpr = Math.min(maxDpr, 1.5)
  renderer.setPixelRatio(dpr)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.shadowMap.autoUpdate = false   // static shadows: redrawn only when asked (see shadowsDirty)

  const scene3 = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 500)
  const harbor: Harbor = buildHarbor(profession, playerName)
  scene3.add(harbor.root)
  let quarter: Quarter | null = null
  let quarterId: ProfessionId | null = null
  let scene: Scene = 'harbor'
  /** Where we're going: changes at once, while `scene` (what's drawn) changes after the fade. */
  let nextScene: Scene = 'harbor'

  const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemi)
  scene3.add(hemi)
  const sun = new THREE.DirectionalLight(DAY.sunCol, DAY.sun)
  sun.position.set(-26, 38, 30)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 30, bottom: -30, near: 1, far: 130 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.04
  scene3.add(sun)
  scene3.background = new THREE.Color(DAY.sky)
  scene3.fog = new THREE.Fog(DAY.sky, 120, 300)

  // ------------------------------------------------------------ camera rig (one home view per kind of scene)
  const HOMES = {
    harbor: { yaw: 0.22, pitch: 0.48, dist: 92, target: new THREE.Vector3(-1, 2, -2), box: { minX: -30, maxX: 30, minZ: -12, maxZ: 14 } },
    quarter: { yaw: 0, pitch: 0.62, dist: 72, target: new THREE.Vector3(0, 2, 0), box: { minX: -24, maxX: 24, minZ: -18, maxZ: 18 } },
  }
  const home = () => (scene === 'harbor' ? HOMES.harbor : HOMES.quarter)
  const view = { yaw: HOMES.harbor.yaw, pitch: HOMES.harbor.pitch, dist: HOMES.harbor.dist, target: HOMES.harbor.target.clone(), offset: 0 }
  const goal = { yaw: view.yaw, pitch: view.pitch, dist: view.dist, target: view.target.clone(), offset: 0 }
  let follow = false   // the camera follows your merchant once you walk
  const clampGoal = () => {
    const b = home().box
    goal.yaw = THREE.MathUtils.clamp(goal.yaw, -1.0, 1.0)
    goal.pitch = THREE.MathUtils.clamp(goal.pitch, 0.22, 1.1)
    goal.dist = THREE.MathUtils.clamp(goal.dist, scene === 'harbor' ? 18 : 12, 130)
    goal.target.x = THREE.MathUtils.clamp(goal.target.x, b.minX, b.maxX)
    goal.target.z = THREE.MathUtils.clamp(goal.target.z, b.minZ, b.maxZ)
  }
  const placeCamera = () => {
    const cp = Math.cos(view.pitch)
    camera.position.set(
      view.target.x + view.dist * cp * Math.sin(view.yaw),
      view.target.y + view.dist * Math.sin(view.pitch),
      view.target.z + view.dist * cp * Math.cos(view.yaw),
    )
    camera.lookAt(view.target)
    // Keep the focused place centered in the part of the screen the side panel doesn't cover.
    const w = container.clientWidth, h = container.clientHeight
    if (view.offset > 1) camera.setViewOffset(w + view.offset, h, view.offset, 0, w, h)
    else camera.clearViewOffset()
  }

  let width = 1, height = 1
  const resize = () => {
    width = Math.max(1, container.clientWidth)
    height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    wake()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)

  // ------------------------------------------------------------ people: you, other players, townsfolk, echoes
  let myId = 0
  let myLook = 0
  let mySlaps = true
  let me: Walker = newWalker(new Blob({ dress: profession, look: 0, me: true }), HARBOR_SPAWN)
  scene3.add(me.blob.root)
  const peers = new Map<number, PeerState>()
  const npcs: Npc[] = []
  const ghosts = new Map<number, { blob: Blob; label: Label; playerId: number }>()
  let stalls: StallInfo[] = []
  const gloves = [new Glove(), new Glove()]
  gloves.forEach((g) => g.attach(scene3))
  const herald = new Blob({ dress: 'herald', look: 3 })
  herald.root.position.set(16.0, 1, 1.1)
  herald.root.rotation.y = 0.3
  harbor.root.add(herald.root)
  tagPick(herald.root, { kind: 'place', id: 'duke' })
  let lastSlap: { from: number; to: number } | null = null

  function newWalker(blob: Blob, at: THREE.Vector3): Walker {
    blob.root.position.copy(at)
    return { blob, pos: at.clone(), target: null, speed: WALK_SPEED, heading: Math.PI, moved: 0 }
  }
  function tagPick(obj: THREE.Object3D, hit: Hit) {
    obj.traverse((o) => { o.userData.hit = hit })
  }
  const walkBox = () => (nextScene === 'harbor' ? HARBOR_WALK : QUARTER_BOUNDS)
  const clampWalk = (v: THREE.Vector3) => {
    const b = walkBox()
    v.x = THREE.MathUtils.clamp(v.x, b.minX, b.maxX)
    v.z = THREE.MathUtils.clamp(v.z, b.minZ, b.maxZ)
    v.y = 1
    return v
  }

  // ------------------------------------------------------------ labels (real buttons, so they're clickable and focusable)
  const labels = new Map<string, Label>()
  const makeLabel = (key: string, testid: string, cls: string, point: () => THREE.Vector3, onClick: (() => void) | null, place: boolean): Label => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = cls
    el.dataset.testid = testid
    el.hidden = true
    if (onClick) el.addEventListener('click', onClick)
    else el.tabIndex = -1
    labelLayer.appendChild(el)
    const l: Label = { el, visible: false, width: 120, point, place }
    labels.set(key, l)
    return l
  }
  const dropLabel = (key: string) => {
    labels.get(key)?.el.remove()
    labels.delete(key)
  }
  const setText = (l: Label, text: string) => {
    if (l.el.textContent !== text) {
      l.el.textContent = text
      l.el.hidden = false
      l.width = l.el.offsetWidth || l.width
    }
  }
  const allPicks: PickId[] = [...new Set([...HARBOR_PICKS, ...QUARTER_PICKS])]
  for (const id of allPicks) {
    const l = makeLabel(`place:${id}`, `world-label-${id}`, 'world-label', () => placeLabelPoint(id), () => pickPlace(id), true)
    l.el.addEventListener('pointerenter', () => setHover({ kind: 'place', id }))
    l.el.addEventListener('pointerleave', () => setHover(null))
  }
  const placeLabelPoint = (id: PickId) => (scene === 'harbor' ? harbor.labelPoint(id) : quarter?.labelPoint(id) ?? new THREE.Vector3(0, -100, 0))
  const harborLabels: Partial<Record<PickId, WorldLabel>> = {}
  let quarterLabels: Partial<Record<PickId, WorldLabel>> = {}
  const applyPlaceLabels = () => {
    const src = scene === 'harbor' ? harborLabels : quarterLabels
    const ids = scene === 'harbor' ? HARBOR_PICKS : QUARTER_PICKS
    for (const id of allPicks) {
      const l = labels.get(`place:${id}`)!
      const data = ids.includes(id) ? src[id] : undefined
      l.visible = !!data
      if (data) {
        setText(l, data.text)
        l.el.dataset.tone = data.tone
      }
    }
    wake()
  }

  const tmp = new THREE.Vector3()
  const project = (p: THREE.Vector3) => {
    tmp.copy(p).project(camera)
    return { x: ((tmp.x + 1) / 2) * width, y: ((1 - tmp.y) / 2) * height, ok: tmp.z < 1 && tmp.x > -1.05 && tmp.x < 1.05 && tmp.y > -1.05 && tmp.y < 1.1 }
  }
  // Place labels sit above their place; when two would overlap, the higher one on screen moves up out of the way.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const placeLabels = () => {
    const shown: { l: Label; x: number; y: number }[] = []
    for (const l of labels.values()) {
      if (!l.visible) { l.el.hidden = true; continue }
      const s = project(l.point())
      const ok = s.ok && s.x < width - view.offset - 12   // nothing under the side panel
      l.el.hidden = !ok
      if (!ok) continue
      if (l.place) shown.push({ l, x: s.x, y: s.y })
      else l.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`
    }
    shown.sort((a, b) => b.y - a.y)
    placed.length = 0
    for (const it of shown) {
      const half = it.l.width / 2 + 3
      let y = it.y
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find((r) => it.x - half < r.x1 && it.x + half > r.x0 && y - 28 < r.y1 && y > r.y0)
        if (!hit) break
        y = hit.y0 - 2
      }
      placed.push({ x0: it.x - half, x1: it.x + half, y0: y - 28, y1: y })
      it.l.el.style.transform = `translate(${it.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
    }
  }

  // Speech bubbles ("Challenge!", "Ciao!") over a player for a moment.
  const bubbles = new Map<number, { label: Label; until: number }>()
  const say = (id: number, text: string) => {
    const w = id === myId ? me : peers.get(id)
    if (!w) return
    const key = `say:${id}`
    let b = bubbles.get(id)
    if (!b) {
      const label = makeLabel(key, 'world-bubble', 'world-bubble', () => w.pos.clone().setY(w.pos.y + w.blob.top + 0.9), null, false)
      b = { label, until: 0 }
      bubbles.set(id, b)
    }
    b.label.point = () => w.pos.clone().setY(w.pos.y + w.blob.top + 0.9)
    setText(b.label, text)
    b.label.visible = true
    b.until = performance.now() + 1700
    wake(1800)
  }

  // ------------------------------------------------------------ mouse: drag to turn, right/shift-drag to pan, wheel to zoom,
  // click a place / a player / the ground (touch: one finger turns, two fingers pinch to zoom)
  let drag: { x: number; y: number; pan: boolean; moved: boolean } | null = null
  const touches = new Map<number, { x: number; y: number }>()
  let pinch: { d: number; dist: number } | null = null
  const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }
  const onDown = (e: PointerEvent) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.size === 2) { pinch = { d: spread(), dist: goal.dist }; drag = null; return }
    drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey, moved: false }
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && touches.size === 2) {
      goal.dist = (pinch.dist * pinch.d) / Math.max(1, spread())
      clampGoal()
      wake()
      return
    }
    if (!drag) { if (e.pointerType === 'mouse') hoverAt(e); return }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    drag.x = e.clientX
    drag.y = e.clientY
    if (drag.pan) {
      follow = false
      const s = goal.dist * 0.0016
      const right = new THREE.Vector3(Math.cos(goal.yaw), 0, -Math.sin(goal.yaw))
      const fwd = new THREE.Vector3(Math.sin(goal.yaw), 0, Math.cos(goal.yaw))
      goal.target.addScaledVector(right, -dx * s).addScaledVector(fwd, -dy * s)
    } else {
      goal.yaw -= dx * 0.005
      goal.pitch += dy * 0.004
    }
    clampGoal()
    wake()
  }
  const onUp = (e: PointerEvent) => {
    touches.delete(e.pointerId)
    if (touches.size < 2) pinch = null
    const wasClick = drag && !drag.moved && e.button === 0
    drag = null
    if (!wasClick) return
    const hit = pickAt(e)
    if (hit?.kind === 'place') pickPlace(hit.id)
    else if (hit?.kind === 'player') pickPlayer(hit.id)
    else {
      const p = groundAt(e)
      if (p) walkToPoint(p, WALK_SPEED)
    }
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    goal.dist *= 1 + Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) * 0.0015, 0.2)
    clampGoal()
    wake()
  }
  const noMenu = (e: Event) => e.preventDefault()
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); pinch = null; drag = null })
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', noMenu)
  canvas.addEventListener('pointerleave', () => setHover(null))

  // ------------------------------------------------------------ keyboard: WASD / arrows walk (camera-relative)
  const keys = new Set<string>()
  const MOVE_KEYS: Record<string, [number, number]> = {
    KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  }
  const typing = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || !!t.closest?.('.side-panel, dialog, .player-card'))
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return
    if (MOVE_KEYS[e.code]) {
      keys.add(e.code)
      me.target = null
      follow = true
      e.preventDefault()
      wake()
    }
  }
  const onKeyUp = (e: KeyboardEvent) => { keys.delete(e.code) }
  const onBlur = () => keys.clear()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  // ------------------------------------------------------------ picking and hover
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1)
  for (const [id, objs] of harbor.picks) for (const obj of objs) tagPick(obj, { kind: 'place', id })
  const pickRoots = (): THREE.Object3D[] => {
    const out: THREE.Object3D[] = []
    if (scene === 'harbor') {
      for (const objs of harbor.picks.values()) out.push(...objs.filter((o) => o.visible))
      out.push(herald.root)
    } else if (quarter) {
      for (const objs of quarter.picks.values()) out.push(...objs)
      quarter.slots.forEach((s, i) => { if (stalls[i]) out.push(s.group) })
      for (const p of peers.values()) out.push(p.blob.root)
      for (const g of ghosts.values()) out.push(g.blob.root)
    }
    return out
  }
  const setRay = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
  }
  const pickAt = (e: { clientX: number; clientY: number }): Hit | null => {
    setRay(e)
    const hit = ray.intersectObjects(pickRoots(), true).find((h) => h.object.visible && h.object.userData.hit)
    return (hit?.object.userData.hit as Hit) ?? null
  }
  const groundAt = (e: { clientX: number; clientY: number }): THREE.Vector3 | null => {
    setRay(e)
    const p = new THREE.Vector3()
    return ray.ray.intersectPlane(ground, p) ? clampWalk(p) : null
  }
  let hovered: Hit | null = null
  const sameHit = (a: Hit | null, b: Hit | null) => (a && b ? a.kind === b.kind && a.id === b.id : a === b)
  const highlightOf = (h: Hit | null): THREE.MeshStandardMaterial[] => {
    if (!h) return []
    if (h.kind === 'place') return (scene === 'harbor' ? harbor.highlight.get(h.id) : quarter?.highlight.get(h.id)) ?? []
    const slot = stalls.findIndex((s) => s.id === h.id)
    return slot >= 0 && quarter ? [quarter.slots[slot].material] : []
  }
  const setHover = (h: Hit | null) => {
    if (sameHit(h, hovered)) return
    highlightOf(hovered).forEach((m) => m.emissive.setRGB(0, 0, 0))
    hovered = h
    highlightOf(h).forEach((m) => m.emissive.setRGB(0.09, 0.12, 0.1))
    canvas.style.cursor = h ? 'pointer' : ''
    for (const [key, l] of labels) l.el.classList.toggle('hover', !!h && h.kind === 'place' && key === `place:${h.id}`)
    wake()
  }
  let lastHover = 0
  const hoverAt = (e: PointerEvent) => {
    const t = performance.now()
    if (t - lastHover < 50) return   // raycast at most 20 times a second
    lastHover = t
    setHover(pickAt(e))
  }

  // ------------------------------------------------------------ walking
  /** Where your merchant stands to use a place: in front of it, on the walkable ground. */
  const doorPoint = (id: PickId): THREE.Vector3 => {
    if (scene === 'harbor') {
      if (id === 'news') return new THREE.Vector3(9.5, 1, 3.4)
      const f = harbor.focusPoint(id)
      return clampWalk(new THREE.Vector3(f.x, 1, f.z + 2.2))
    }
    const f = quarter?.focusPoint(id) ?? new THREE.Vector3()
    if (id === 'duke') return new THREE.Vector3(0, 1, 4.2)
    return clampWalk(new THREE.Vector3(f.x, 1, f.z + 1.5))
  }
  /** Walk somewhere; fast enough to get there in about a second when it's a place you clicked. */
  const walkToPoint = (p: THREE.Vector3, minSpeed: number) => {
    me.target = clampWalk(p.clone())
    me.speed = THREE.MathUtils.clamp(me.pos.distanceTo(me.target) / 1.0, minSpeed, 25)
    follow = true
    wake()
  }
  const pickPlace = (id: PickId) => {
    cb.onPick(id)
    walkToPoint(doorPoint(id), WALK_SPEED)
  }
  const pickPlayer = (id: number) => {
    cb.onPickPlayer?.(id)
    const p = peers.get(id)
    const slot = stalls.findIndex((s) => s.id === id)
    const at = p ? p.pos : ghosts.get(slot)?.blob.root.position ?? (slot >= 0 && quarter ? quarter.slots[slot].front : null)
    if (at) {
      const dir = new THREE.Vector3().subVectors(me.pos, at).setY(0)
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1)
      walkToPoint(at.clone().addScaledVector(dir.normalize(), 1.6), WALK_SPEED)
    }
  }

  let lastSent = { at: 0, x: NaN, z: NaN }
  const reportMove = (force: boolean) => {
    if (scene === 'harbor' || !cb.onMove) return
    const t = performance.now()
    const changed = !(Math.abs(me.pos.x - lastSent.x) <= 0.02 && Math.abs(me.pos.z - lastSent.z) <= 0.02)   // NaN (nothing sent yet) counts as changed
    if (!changed || (!force && t - lastSent.at < SEND_EVERY_MS)) return
    lastSent = { at: t, x: me.pos.x, z: me.pos.z }
    cb.onMove(round2(me.pos.x), round2(me.pos.z), round2(me.heading))
  }
  const round2 = (v: number) => Math.round(v * 100) / 100

  const stepWalker = (w: Walker, dt: number, dir: THREE.Vector3 | null) => {
    const before = w.pos.clone()
    if (dir && dir.lengthSq() > 0) {
      w.pos.addScaledVector(dir.normalize(), WALK_SPEED * dt)
    } else if (w.target) {
      const to = new THREE.Vector3().subVectors(w.target, w.pos).setY(0)
      const d = to.length()
      const step = w.speed * dt
      if (d <= step) { w.pos.copy(w.target); w.target = null }
      else w.pos.addScaledVector(to.divideScalar(d), step)
    }
    const moved = before.distanceTo(w.pos)
    w.moved = dt > 0 ? moved / dt : 0
    if (moved > 0.0005) w.heading = Math.atan2(w.pos.x - before.x, w.pos.z - before.z)
    w.blob.root.position.copy(w.pos)
    const dh = Math.atan2(Math.sin(w.heading - w.blob.root.rotation.y), Math.cos(w.heading - w.blob.root.rotation.y))
    w.blob.root.rotation.y += dh * Math.min(1, dt * 12)
    w.blob.update(Math.min(dt, 0.05), w.moved, reduceMotion)
    return moved > 0.0005
  }

  // ------------------------------------------------------------ townsfolk (fill quiet places) and echoes
  const NPC_DRESSES: Dress[] = ['porter', 'priest', 'fishwife', 'porter', 'fishwife', 'priest']
  const npcArea = () => (scene === 'harbor' ? { minX: -28, maxX: 28, minZ: 0.4, maxZ: 3.3 } : QUARTER_BOUNDS)
  const randomSpot = (a: Npc['area']) => {
    const v = new THREE.Vector3(a.minX + Math.random() * (a.maxX - a.minX), 1, a.minZ + Math.random() * (a.maxZ - a.minZ))
    if (scene !== 'harbor' && v.length() < 3.4) v.setLength(3.6).setY(1)
    return v
  }
  const setTownsfolk = (n: number) => {
    while (npcs.length > n) npcs.pop()!.blob.dispose()
    while (npcs.length < n) {
      const area = npcArea()
      const w = newWalker(new Blob({ dress: NPC_DRESSES[npcs.length % NPC_DRESSES.length], look: (npcs.length * 2 + 1) % 6 }), randomSpot(area)) as Npc
      w.speed = 1.3 + Math.random() * 0.5
      w.pause = Math.random() * 3
      w.area = area
      scene3.add(w.blob.root)
      npcs.push(w)
    }
  }
  const crowdChanged = () => {
    if (scene === 'harbor') { setTownsfolk(2); return }
    // Echoes: crafters who did something lately but aren't here now, at their stall.
    const want = new Map<number, number>()
    stalls.forEach((s, slot) => { if (s.echo && !s.me && !peers.has(s.id)) want.set(slot, s.id) })
    for (const [slot, g] of ghosts) {
      if (want.get(slot) !== g.playerId) {
        g.blob.dispose()
        dropLabel(`ghost:${slot}`)
        ghosts.delete(slot)
      }
    }
    for (const [slot, pid] of want) {
      if (ghosts.has(slot) || !quarter) continue
      const s = stalls[slot]
      const blob = new Blob({ dress: s.profession, look: s.look, ghost: true })
      blob.root.position.copy(quarter.slots[slot].front)
      blob.root.rotation.y = quarter.slots[slot].facing
      tagPick(blob.root, { kind: 'player', id: pid })
      scene3.add(blob.root)
      const at = blob.root.position.clone().setY(1 + blob.top + 0.5)
      const label = makeLabel(`ghost:${slot}`, `world-echo-${pid}`, 'world-bubble echo', () => at, () => pickPlayer(pid), false)
      setText(label, `${s.name} ${s.echo}`)
      label.visible = true
      ghosts.set(slot, { blob, label, playerId: pid })
    }
    // Townsfolk until there are about 8 merchants about (at most 6 of them).
    setTownsfolk(Math.max(0, Math.min(6, 8 - peers.size - ghosts.size)))
    wake()
  }

  // ------------------------------------------------------------ other players
  const peerLabelText = (p: Peer) => `${p.friend ? '★ ' : ''}${p.name}`
  const peerUpsert = (p: Peer) => {
    const have = peers.get(p.id)
    if (have) {
      have.peer = p
      have.blob.setSlapsOff(!p.slaps)
      setText(have.label, peerLabelText(p))
      return
    }
    if (nextScene === 'harbor') return
    const blob = new Blob({ dress: p.profession, look: p.look })
    const w = newWalker(blob, clampWalk(new THREE.Vector3(p.x, 1, p.z))) as PeerState
    w.heading = p.h
    blob.root.rotation.y = p.h
    blob.setSlapsOff(!p.slaps)
    tagPick(blob.root, { kind: 'player', id: p.id })
    scene3.add(blob.root)
    w.peer = p
    w.label = makeLabel(`peer:${p.id}`, `world-peer-${p.id}`, 'world-label person', () => w.pos.clone().setY(w.pos.y + w.blob.top + 0.3), () => pickPlayer(p.id), false)
    setText(w.label, peerLabelText(p))
    w.label.visible = true
    peers.set(p.id, w)
    crowdChanged()
  }
  const peerRemove = (id: number) => {
    const w = peers.get(id)
    if (!w) return
    w.blob.dispose()
    dropLabel(`peer:${id}`)
    peers.delete(id)
    crowdChanged()
  }
  const peersClear = () => {
    for (const id of [...peers.keys()]) peerRemove(id)
  }

  // ------------------------------------------------------------ slaps
  const posOf = (id: number) => (id === myId ? me.pos : peers.get(id)?.pos)
  const slap = (from: number, to: number) => {
    const a = posOf(from), b = posOf(to)
    if (!a || !b) return
    lastSlap = { from, to }
    const glove = gloves.find((g) => !g.busy) ?? gloves[0]
    glove.swing(a, b)
    const dir = new THREE.Vector3().subVectors(b, a).setY(0)
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1)
    dir.normalize()
    const victim = to === myId ? me : peers.get(to)
    if (!victim) return
    setTimeout(() => {
      victim.blob.slapped()
      const start = victim.pos.clone()
      const end = clampWalk(start.clone().addScaledVector(dir, 0.9))
      victim.target = null
      tween(0.3, (k) => {
        victim.pos.lerpVectors(start, end, 1 - (1 - k) * (1 - k))
        victim.blob.root.position.copy(victim.pos)
      }, () => { if (victim === me) reportMove(true) })
      say(to, 'Challenge!')
    }, reduceMotion ? 0 : 160)
    wake(1500)
  }

  // ------------------------------------------------------------ tweens and the harbor's state
  const tweens: Tween[] = []
  const tween = (dur: number, fn: (k: number) => void, done?: () => void) => {
    tweens.push({ t: 0, dur: reduceMotion ? 0.01 : dur, fn, done })
    wake()
  }
  const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)
  let shadowsDirty = true
  const live = harbor.live
  let crafting = { active: 0, ready: 0 }
  let shipU = 0
  let shipGoal = 0
  const placeShip = () => {
    const p = harbor.shipCurve.getPoint(shipU)
    const d = harbor.shipCurve.getTangent(Math.min(0.999, Math.max(0.001, shipU)))
    live.galley.position.set(p.x, live.galley.position.y, p.z)
    live.galley.rotation.y = Math.atan2(-d.z, d.x)
  }
  placeShip()

  const setState = (s: WorldState) => {
    // station: show the fill as ore in the cart, plants in the beds or hides on the racks
    live.station.forEach((m, i) => {
      const n = Math.round(Math.min(1, Math.max(0, s.stationFill[i] ?? 0)) * live.stationCaps[i])
      if (m.count !== n) { m.count = n; shadowsDirty = true }
    })
    live.stationMarker.visible = s.stationFill.some((f) => f >= 1)
    crafting = s.crafting
    live.workMarker.visible = s.crafting.ready > 0
    const crates = Math.min(live.crates.instanceMatrix.count, s.bagKinds)
    if (live.crates.count !== crates) { live.crates.count = crates; shadowsDirty = true }
    const goods = Math.min(live.goods.instanceMatrix.count, s.listings)
    if (live.goods.count !== goods) { live.goods.count = goods; shadowsDirty = true }
    live.customers.forEach((c, i) => {
      const want = s.customers[i]
      if (want) {
        c.hat.color.set(want.kind === 'collector' ? '#F2C53D' : want.kind === 'bundle' ? '#2A4C9A' : '#B83A3A')
        c.marker.visible = want.ready
        if (!c.group.visible) {
          // a new customer walks in from the left of the quay
          c.group.visible = true
          const from = c.home.clone().setX(c.home.x - 14)
          c.group.rotation.y = Math.PI / 2
          tween(2.2, (k) => {
            c.group.position.lerpVectors(from, c.home, ease(k))
            c.group.position.y = c.home.y + Math.abs(Math.sin(k * 18)) * 0.08
          }, () => { c.group.rotation.y = Math.PI; c.group.position.copy(c.home); shadowsDirty = true })
        }
      } else if (c.group.visible) {
        c.group.visible = false
        shadowsDirty = true
      }
    })
    if (live.bunting.visible !== s.festival) live.bunting.visible = s.festival
    const wantShip = s.eventNow ? 1 : 0
    if (wantShip !== shipGoal) {
      shipGoal = wantShip
      const from = shipU
      tween(reduceMotion ? 0.01 : 8, (k) => { shipU = from + (wantShip - from) * ease(k); placeShip() })
    }
    for (const id of HARBOR_PICKS) {
      const data = s.labels[id]
      if (data) harborLabels[id] = data
      else delete harborLabels[id]
    }
    applyPlaceLabels()
  }

  // ------------------------------------------------------------ scenes
  const setStalls = (list: StallInfo[]) => {
    stalls = list.slice(0, quarter?.slots.length ?? 12)
    if (quarter) {
      quarter.slots.forEach((slot, i) => {
        const s = stalls[i]
        quarter!.paintSign(i, s ? s.name : '', !!s?.friend)
        slot.goods.count = s ? Math.min(4, s.listings) : 0
        if (s) tagPick(slot.group, { kind: 'player', id: s.id })
        else slot.group.traverse((o) => { delete o.userData.hit })
      })
      shadowsDirty = true
    }
    crowdChanged()
  }
  /** Your merchant's body color and slap flag (a new body if the look changed). */
  const applyMe = (mine: { look: number; slaps: boolean }) => {
    if (mine.look !== myLook) {
      const at = me.pos.clone()
      me.blob.dispose()
      me = newWalker(new Blob({ dress: profession, look: mine.look, me: true }), at)
      scene3.add(me.blob.root)
      myLook = mine.look
    }
    mySlaps = mine.slaps
    me.blob.setSlapsOff(!mySlaps)
    wake()
  }
  const setScene = (next: Scene, mine: { look: number; slaps: boolean }) => {
    const swap = () => {
      for (const slot of [...ghosts.keys()]) { ghosts.get(slot)!.blob.dispose(); dropLabel(`ghost:${slot}`); ghosts.delete(slot) }
      setTownsfolk(0)
      stalls = []
      scene = next
      if (next !== 'harbor' && quarterId !== next) {
        quarter?.dispose()
        quarter = buildQuarter(next)
        quarterId = next
        scene3.add(quarter.root)
      }
      harbor.root.visible = next === 'harbor'
      if (quarter) quarter.root.visible = next !== 'harbor'
      quarterLabels = {}
      // you arrive at your bottega door or the top of the Steps
      applyMe(mine)
      me.pos.copy(next === 'harbor' ? (HARBOR_SPAWN) : QUARTER_SPAWN)
      me.target = null
      me.blob.root.position.copy(me.pos)
      me.heading = Math.PI
      me.blob.root.rotation.y = Math.PI
      lastSent = { at: 0, x: NaN, z: NaN }
      const h = home()
      Object.assign(goal, { yaw: h.yaw, pitch: h.pitch, dist: h.dist })
      goal.target.copy(h.target)
      Object.assign(view, { yaw: h.yaw, pitch: h.pitch, dist: h.dist })
      view.target.copy(h.target)
      follow = false
      setHover(null)
      crowdChanged()
      applyPlaceLabels()
      shadowsDirty = true
      fade.classList.remove('on')
      wake(800)
    }
    if (next === nextScene) { applyMe(mine); return }
    // Players of the place you're leaving go at once; the new room's players may arrive during the fade.
    nextScene = next
    peersClear()
    if (reduceMotion) { swap(); return }
    fade.classList.add('on')
    setTimeout(swap, 260)
  }

  // ------------------------------------------------------------ day and night
  let night = 0, nightGoal = 0
  const cA = new THREE.Color(), cB = new THREE.Color()
  const mix = (a: string, b: string, k: number) => cA.set(a).lerp(cB.set(b), k)
  const applyTime = (k: number) => {
    const L = (a: number, b: number) => a + (b - a) * k
    ;(scene3.background as THREE.Color).copy(mix(DAY.sky, NIGHT.sky, k))
    ;(scene3.fog as THREE.Fog).color.copy(scene3.background as THREE.Color)
    hemi.color.copy(mix(DAY.hemiSky, NIGHT.hemiSky, k))
    hemi.groundColor.copy(mix(DAY.hemiGround, NIGHT.hemiGround, k))
    hemi.intensity = L(DAY.hemi, NIGHT.hemi)
    sun.intensity = L(DAY.sun, NIGHT.sun)
    sun.color.copy(mix(DAY.sunCol, NIGHT.sunCol, k))
    harbor.materials.sea.color.copy(mix(DAY.sea, NIGHT.sea, k))
    harbor.materials.window.emissiveIntensity = L(DAY.win, NIGHT.win)
    harbor.materials.lamp.emissiveIntensity = L(DAY.lamp, NIGHT.lamp)
    harbor.materials.door.emissiveIntensity = L(DAY.door, NIGHT.door)
    harbor.lights.door.intensity = L(0, NIGHT.lampLight)
    harbor.lights.pier.intensity = L(0, NIGHT.lampLight)
    container.style.background = '#' + (scene3.background as THREE.Color).getHexString()
  }
  applyTime(0)

  // ------------------------------------------------------------ particles at the workbench
  const pPos = live.particles.geometry.attributes.position as THREE.BufferAttribute
  const parts = Array.from({ length: pPos.count }, () => ({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0 }))
  const emit = (n: number) => {
    let k = 0
    for (const p of parts) {
      if (p.life > 0) continue
      if (live.particleKind === 'sparks') Object.assign(p, { life: 0.6 + Math.random() * 0.5, x: 3.4 + (Math.random() - 0.5) * 1.2, y: 2.5, z: -2.4 + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 2.4, vy: 2.5 + Math.random() * 2.5, vz: Math.random() * 1.5 - 0.3 })
      else if (live.particleKind === 'bubbles') Object.assign(p, { life: 1 + Math.random() * 0.8, x: 4.25 + (Math.random() - 0.5) * 0.3, y: 2.9, z: -2.6 + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 0.2, vy: 0.8 + Math.random() * 0.5, vz: 0 })
      else Object.assign(p, { life: 0.5 + Math.random() * 0.4, x: 3.0 + (Math.random() - 0.5) * 1.4, y: 2.2, z: -2.6 + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 1, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 0.6 })
      if (++k >= n) break
    }
  }

  // ------------------------------------------------------------ the loop
  let running = true
  let raf = 0
  let last = performance.now()
  let lastRender = 0
  let awakeUntil = 0
  let idle = false
  let t = 0
  let frames = 0, frameTimeSum = 0, fps = 0, fpsClock = performance.now()
  function wake(ms = 600) { awakeUntil = Math.max(awakeUntil, performance.now() + ms) }
  const moveDir = new THREE.Vector3()

  const frame = (now: number) => {
    if (!running) return
    raf = requestAnimationFrame(frame)
    if (document.hidden) { last = now; return }
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    // Full frame rate while something moves (camera, people, tweens, hover); 30 fps for the ambient sea
    // otherwise; with reduced motion, nothing ambient at all.
    const peopleMoving = keys.size > 0 || !!me.target || [...peers.values()].some((p) => p.target)
    if (peopleMoving) wake(300)
    const moving = tweens.length > 0 || now < awakeUntil || Math.abs(nightGoal - night) > 0.001
    const ambient = !reduceMotion
    if (!moving && (!ambient || now - lastRender < 1000 / 30)) { idle = !moving && !ambient; return }
    const step = Math.min((now - lastRender) / 1000, 0.05)
    // People move by real time (up to half a second a frame), so walking speed doesn't depend on frame rate;
    // after the loop sat idle (reduced motion, nothing moving), the first step starts from a standstill.
    const walkStep = idle ? 1 / 60 : Math.min((now - lastRender) / 1000, 0.5)
    idle = false
    lastRender = now
    if (ambient) t += step

    // your merchant: keys (camera-relative) or a walk target
    moveDir.set(0, 0, 0)
    for (const k of keys) {
      const [sx, sz] = MOVE_KEYS[k]
      moveDir.x += sx * Math.cos(goal.yaw) - sz * Math.sin(goal.yaw)
      moveDir.z += -sx * Math.sin(goal.yaw) - sz * Math.cos(goal.yaw)
    }
    const meMoved = stepWalker(me, walkStep, keys.size ? moveDir : null)
    if (meMoved) clampWalk(me.pos), me.blob.root.position.copy(me.pos)
    reportMove(!meMoved && !keys.size && !me.target)
    if (follow && (meMoved || keys.size)) goal.target.set(me.pos.x, 2, me.pos.z), clampGoal()

    // other players glide toward where the room says they are; townsfolk wander
    for (const p of peers.values()) stepWalker(p, walkStep, null)
    for (const n of npcs) {
      if (!n.target) {
        n.pause -= step
        if (n.pause <= 0) { n.target = randomSpot(n.area); n.pause = 1 + Math.random() * 4 }
      }
      stepWalker(n, walkStep, null)
    }
    if (scene === 'harbor') herald.update(step, 0, reduceMotion)
    for (const g of ghosts.values()) g.blob.update(step, 0, reduceMotion)
    gloves.forEach((g) => g.update(step))
    for (const [id, b] of bubbles) if (now > b.until) { dropLabel(`say:${id}`); bubbles.delete(id) }

    // camera easing
    const ease8 = Math.min(1, dt * 8)
    view.yaw += (goal.yaw - view.yaw) * ease8
    view.pitch += (goal.pitch - view.pitch) * ease8
    view.dist += (goal.dist - view.dist) * ease8
    view.offset += (goal.offset - view.offset) * ease8
    view.target.lerp(goal.target, ease8)
    const settling = Math.abs(goal.dist - view.dist) > 0.05 || Math.abs(goal.yaw - view.yaw) > 0.0005 || view.target.distanceTo(goal.target) > 0.01 || Math.abs(goal.offset - view.offset) > 0.5
    if (settling) wake(100)
    placeCamera()

    if (scene === 'harbor') {
      // the harbor moving on its own
      harbor.time.value = t
      harbor.materials.foam.opacity = 0.45 + Math.sin(t * 1.6) * 0.2
      live.galley.position.y = Math.sin(t * 1.3) * 0.08 - 0.1
      live.galley.children[0].rotation.x = Math.sin(t * 0.9) * 0.03
      live.gozzo.position.y = Math.sin(t * 1.7 + 1) * 0.08 - 0.25
      live.gozzo.children[0].rotation.x = Math.sin(t * 1.2) * 0.05
      for (const g of live.gulls) {
        const a = g.ph + t * g.sp
        g.group.position.set(Math.cos(a) * g.rad, g.h + Math.sin(t + g.ph) * 0.6, 6 + Math.sin(a) * g.rad)
        g.group.rotation.y = -a + (g.sp > 0 ? 0 : Math.PI)
        const f = Math.sin(t * 7 + g.ph) * 0.5
        g.l.rotation.x = f
        g.r.rotation.x = -f
      }
      for (const m of [live.stationMarker, live.workMarker, ...live.customers.map((c) => c.marker)]) {
        if (!m.visible) continue
        m.rotation.y = t * 1.8
        m.position.y = (m.userData.baseY as number) + Math.sin(t * 2.4) * 0.15
      }

      // the workbench works while crafts are running
      const busy = crafting.active > 0
      const glow = busy ? 1.2 + Math.sin(t * 6) * 0.25 : 0.35
      if (live.workGlow) live.workGlow.emissiveIntensity = glow
      live.workLight.intensity = busy ? 10 + Math.sin(t * 7) * 2 : 2
      if (live.workAnim) {
        if (live.particleKind === 'dust') live.workAnim.rotation.z = busy ? -Math.abs(Math.sin(t * 5)) * 0.9 : 0
        else live.workAnim.scale.setScalar(busy ? 1 + Math.sin(t * 12) * 0.12 : 0.7)
      }
      if (busy && ambient && Math.random() < step * (live.particleKind === 'bubbles' ? 6 : 10)) emit(live.particleKind === 'sparks' ? 4 : 2)
      let anyAlive = false
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        if (p.life > 0) {
          anyAlive = true
          p.life -= step
          if (live.particleKind === 'sparks') p.vy -= 9 * step
          p.x += p.vx * step
          p.y += p.vy * step
          p.z += p.vz * step
          if (p.life <= 0) p.y = -99
        }
        pPos.setXYZ(i, p.x, p.y, p.z)
      }
      if (anyAlive || busy) pPos.needsUpdate = true
    }

    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]
      tw.t += dt
      const k = Math.min(1, tw.t / tw.dur)
      tw.fn(k)
      if (k >= 1) { tweens.splice(i, 1); tw.done?.() }
    }

    if (Math.abs(nightGoal - night) > 0.001) {
      night += Math.sign(nightGoal - night) * Math.min(Math.abs(nightGoal - night), dt * 0.9)
      applyTime(night)
    }

    if (shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false }
    renderer.render(scene3, camera)
    placeLabels()

    // adaptive quality: watch the frame time and trade sharpness for smoothness when needed
    frames++
    frameTimeSum += dt
    if (now - fpsClock > 2000) {
      fps = Math.round((frames * 1000) / (now - fpsClock))
      const avg = frameTimeSum / frames
      if (moving && avg > 0.028 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); resize() }
      else if (avg < 0.012 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + 0.25); renderer.setPixelRatio(dpr); resize() }
      frames = 0
      frameTimeSum = 0
      fpsClock = now
      if (debugEl) debugEl.textContent = `${fps} fps · ${renderer.info.render.calls} draws · ${Math.round(renderer.info.render.triangles / 1000)}k tris · dpr ${dpr} · ${peers.size} players`
    }
  }

  const debugEl = new URLSearchParams(location.search).has('debug') ? document.createElement('div') : null
  if (debugEl) {
    debugEl.className = 'world-debug'
    container.appendChild(debugEl)
  }

  resize()
  placeCamera()
  setTownsfolk(2)
  raf = requestAnimationFrame(frame)

  const screenOf = (p: THREE.Vector3 | null | undefined) => {
    if (!p) return null
    const s = project(p)
    if (!s.ok) return null
    const r = canvas.getBoundingClientRect()
    return { x: r.left + s.x, y: r.top + s.y }
  }
  window.__guildieWorld = {
    ready: true,
    screenPoint: (id) => screenOf(scene === 'harbor' ? harbor.focusPoint(id) : quarter?.focusPoint(id)),
    screenPointPlayer: (id) => {
      const w = id === myId ? me : peers.get(id)
      return screenOf(w ? w.pos.clone().setY(w.pos.y + 0.8) : null)
    },
    screenPointStall: (slot) => (quarter?.slots[slot] ? screenOf(quarter.slots[slot].front.clone().add(new THREE.Vector3(0, 3, 0)).lerp(quarter.slots[slot].labelPoint, 0.3)) : null),
    me: () => ({ x: me.pos.x, z: me.pos.z, scene }),
    peers: () => [...peers.keys()],
    peer: (id) => { const w = peers.get(id); return w ? { x: w.pos.x, z: w.pos.z } : null },
    lastSlap: null,
    stats: () => ({ fps, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, dpr, peers: peers.size, townsfolk: npcs.length, echoes: ghosts.size }),
  }
  Object.defineProperty(window.__guildieWorld, 'lastSlap', { get: () => lastSlap })

  return {
    setState,
    focus(id, panelWidth) {
      goal.offset = panelWidth
      if (id) {
        goal.target.copy(scene === 'harbor' ? harbor.focusPoint(id) : quarter?.focusPoint(id) ?? goal.target)
        goal.dist = Math.min(goal.dist, 44)
        follow = false
      }
      clampGoal()
      wake()
    },
    setNight(n) {
      nightGoal = n ? 1 : 0
      if (reduceMotion) { night = nightGoal; applyTime(night) }
      wake()
    },
    resetView() {
      const h = home()
      Object.assign(goal, { yaw: h.yaw, pitch: h.pitch, dist: h.dist })
      goal.target.copy(h.target)
      follow = false
      wake()
    },
    setScene,
    setStalls,
    setQuarterLabels(l) {
      quarterLabels = l
      applyPlaceLabels()
    },
    walkTo(id) {
      walkToPoint(doorPoint(id), WALK_SPEED)
    },
    peerUpsert,
    peerMove(id, x, z, h) {
      const w = peers.get(id)
      if (!w) return
      const to = clampWalk(new THREE.Vector3(x, 1, z))
      if (w.pos.distanceTo(to) > 8) { w.pos.copy(to); w.target = null }
      else { w.target = to; w.speed = Math.max(WALK_SPEED, w.pos.distanceTo(to) / 0.22) }
      w.peer.x = x
      w.peer.z = z
      w.peer.h = h
      wake()
    },
    peerRemove,
    peersClear,
    wave(id) {
      const w = id === myId ? me : peers.get(id)
      if (!w) return
      w.blob.wave()
      say(id, 'Ciao!')
    },
    slap,
    setSlaps(id, on) {
      if (id === myId) { mySlaps = on; me.blob.setSlapsOff(!on) }
      const w = peers.get(id)
      if (w) { w.peer.slaps = on; w.blob.setSlapsOff(!on) }
      wake()
    },
    nearestPeer(reach) {
      let best: number | null = null
      let bestD = reach
      for (const [id, w] of peers) {
        const d = Math.hypot(w.pos.x - me.pos.x, w.pos.z - me.pos.z)
        if (d <= bestD) { bestD = d; best = id }
      }
      return best
    },
    setMyId(id) { myId = id },
    say,
    dispose() {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      scene3.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose()
          mat.dispose()
        }
      })
      renderer.dispose()
      canvas.remove()
      labelLayer.remove()
      fade.remove()
      debugEl?.remove()
      if (window.__guildieWorld) window.__guildieWorld.ready = false
    },
  }
}
