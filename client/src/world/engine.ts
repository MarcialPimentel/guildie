// The 3D harbor engine: renderer, camera, mouse controls, picking, floating labels, day/night and the
// animation loop. Loaded on demand (dynamic import) so phones and the classic view never download it.
//
// Kept light for browsers: the static town is baked into a few meshes (see kit.ts bake), the sea's waves
// run on the GPU, shadows are drawn once and only redrawn when something in the scene changes, the frame
// rate drops to 30 when nothing is moving, the pixel ratio adapts to how fast the machine is, and nothing
// renders while the tab is hidden.
import * as THREE from 'three'
import { buildHarbor, type Harbor } from './harbor'
import type { PickId, ProfessionId, WorldCallbacks, WorldEngine, WorldState } from './types'

const PICK_IDS: PickId[] = ['station', 'workbench', 'orders', 'ledger', 'bag', 'stall', 'mercato', 'city', 'news']

const DAY = { sky: '#BFE6EA', hemiSky: '#E6F7F7', hemiGround: '#E8D3B0', hemi: 1.3, sun: 2.4, sunCol: '#FFF0D2', sea: '#FFFFFF', win: 0, lamp: 0.25, lampLight: 0, door: 0.25 }
const NIGHT = { sky: '#0F2B3A', hemiSky: '#3C6585', hemiGround: '#1B2B33', hemi: 0.55, sun: 0.55, sunCol: '#9FB8E8', sea: '#3E6F86', win: 1.6, lamp: 2.4, lampLight: 14, door: 1.2 }

interface Tween { t: number; dur: number; fn: (k: number) => void; done?: () => void }

declare global {
  interface Window {
    /** Read-only hooks for the browser test and for checking performance (?debug=1 shows them on screen). */
    __guildieWorld?: { ready: boolean; screenPoint(id: PickId): { x: number; y: number } | null; stats(): Record<string, number> }
  }
}

export function createWorld(container: HTMLElement, profession: ProfessionId, playerName: string, cb: WorldCallbacks): WorldEngine {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const canvas = document.createElement('canvas')
  canvas.className = 'world-canvas'
  canvas.setAttribute('aria-label', 'Your bottega on the Portovela harbor. Use the buttons or the labels to open each place.')
  container.prepend(canvas)
  const labelLayer = document.createElement('div')
  labelLayer.className = 'world-labels'
  container.appendChild(labelLayer)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  const maxDpr = Math.min(window.devicePixelRatio || 1, 2)
  let dpr = Math.min(maxDpr, 1.5)
  renderer.setPixelRatio(dpr)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.shadowMap.autoUpdate = false   // static shadows: redrawn only when asked (see shadowsDirty)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 500)
  const harbor: Harbor = buildHarbor(profession, playerName)
  scene.add(harbor.root)

  const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemi)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(DAY.sunCol, DAY.sun)
  sun.position.set(-26, 38, 30)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 30, bottom: -30, near: 1, far: 130 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.04
  scene.add(sun)
  scene.background = new THREE.Color(DAY.sky)
  scene.fog = new THREE.Fog(DAY.sky, 120, 300)

  // ------------------------------------------------------------ camera rig
  const HOME = { yaw: 0.22, pitch: 0.48, dist: 92 }
  const homeTarget = new THREE.Vector3(-1, 2, -2)
  const view = { ...HOME, target: homeTarget.clone(), offset: 0 }
  const goal = { ...HOME, target: homeTarget.clone(), offset: 0 }
  const clampGoal = () => {
    goal.yaw = THREE.MathUtils.clamp(goal.yaw, -1.0, 1.0)
    goal.pitch = THREE.MathUtils.clamp(goal.pitch, 0.22, 1.1)
    goal.dist = THREE.MathUtils.clamp(goal.dist, 18, 130)
    goal.target.x = THREE.MathUtils.clamp(goal.target.x, -30, 30)
    goal.target.z = THREE.MathUtils.clamp(goal.target.z, -12, 14)
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

  // ------------------------------------------------------------ mouse: drag to turn, right/shift-drag to pan, wheel to zoom
  // (touch: one finger turns, two fingers pinch to zoom)
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
    if (wasClick) {
      const id = pickAt(e)
      if (id) cb.onPick(id)
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

  // ------------------------------------------------------------ picking and hover
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const pickTargets: { id: PickId; obj: THREE.Object3D }[] = []
  for (const [id, objs] of harbor.picks) for (const obj of objs) {
    pickTargets.push({ id, obj })
    obj.traverse((o) => { o.userData.pick = id })
  }
  const pickAt = (e: { clientX: number; clientY: number }): PickId | null => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const visible = pickTargets.filter((p) => p.obj.visible).map((p) => p.obj)
    const hit = ray.intersectObjects(visible, true).find((h) => h.object.visible && h.object.userData.pick)
    return (hit?.object.userData.pick as PickId) ?? null
  }
  let hovered: PickId | null = null
  const setHover = (id: PickId | null) => {
    if (id === hovered) return
    if (hovered) harbor.highlight.get(hovered)?.forEach((m) => m.emissive.setRGB(0, 0, 0))
    hovered = id
    if (id) harbor.highlight.get(id)?.forEach((m) => m.emissive.setRGB(0.09, 0.12, 0.1))
    canvas.style.cursor = id ? 'pointer' : ''
    labels.forEach((l, k) => l.el.classList.toggle('hover', k === id))
    wake()
  }
  let lastHover = 0
  const hoverAt = (e: PointerEvent) => {
    const t = performance.now()
    if (t - lastHover < 50) return   // raycast at most 20 times a second
    lastHover = t
    setHover(pickAt(e))
  }

  // ------------------------------------------------------------ floating labels (real buttons, so they're clickable and focusable)
  const labels = new Map<PickId, { el: HTMLButtonElement; visible: boolean; width: number }>()
  for (const id of PICK_IDS) {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'world-label'
    el.dataset.testid = `world-label-${id}`
    el.hidden = true
    el.addEventListener('click', () => cb.onPick(id))
    el.addEventListener('pointerenter', () => setHover(id))
    el.addEventListener('pointerleave', () => setHover(null))
    labelLayer.appendChild(el)
    labels.set(id, { el, visible: false, width: 120 })
  }
  const tmp = new THREE.Vector3()
  const project = (p: THREE.Vector3) => {
    tmp.copy(p).project(camera)
    return { x: ((tmp.x + 1) / 2) * width, y: ((1 - tmp.y) / 2) * height, ok: tmp.z < 1 && tmp.x > -1.05 && tmp.x < 1.05 && tmp.y > -1.05 && tmp.y < 1.1 }
  }
  // Labels sit above their place; when two would overlap, the higher one on screen moves up out of the way.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const placeLabels = () => {
    const shown: { l: { el: HTMLButtonElement; width: number }; x: number; y: number }[] = []
    for (const [id, l] of labels) {
      if (!l.visible) { l.el.hidden = true; continue }
      const s = project(harbor.labelPoint(id))
      const ok = s.ok && s.x < width - view.offset - 12   // nothing under the side panel
      l.el.hidden = !ok
      if (ok) shown.push({ l, x: s.x, y: s.y })
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

  // ------------------------------------------------------------ tweens and state
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
    for (const id of PICK_IDS) {
      const l = labels.get(id)!
      const data = s.labels[id]
      l.visible = !!data
      if (data) {
        if (l.el.textContent !== data.text) {
          l.el.textContent = data.text
          l.el.hidden = false
          l.width = l.el.offsetWidth || l.width
        }
        l.el.dataset.tone = data.tone
      }
    }
    wake()
  }

  // ------------------------------------------------------------ day and night
  let night = 0, nightGoal = 0
  const cA = new THREE.Color(), cB = new THREE.Color()
  const mix = (a: string, b: string, k: number) => cA.set(a).lerp(cB.set(b), k)
  const applyTime = (k: number) => {
    const L = (a: number, b: number) => a + (b - a) * k
    ;(scene.background as THREE.Color).copy(mix(DAY.sky, NIGHT.sky, k))
    ;(scene.fog as THREE.Fog).color.copy(scene.background as THREE.Color)
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
    container.style.background = '#' + (scene.background as THREE.Color).getHexString()
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
  let t = 0
  let frames = 0, frameTimeSum = 0, fps = 0, fpsClock = performance.now()
  const wake = (ms = 600) => { awakeUntil = Math.max(awakeUntil, performance.now() + ms) }

  const frame = (now: number) => {
    if (!running) return
    raf = requestAnimationFrame(frame)
    if (document.hidden) { last = now; return }
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    // Full frame rate while something moves (camera, tweens, hover); 30 fps for the ambient sea otherwise;
    // with reduced motion, nothing ambient at all.
    const moving = tweens.length > 0 || now < awakeUntil || Math.abs(nightGoal - night) > 0.001
    const ambient = !reduceMotion
    if (!moving && (!ambient || now - lastRender < 1000 / 30)) return
    const step = Math.min((now - lastRender) / 1000, 0.05)
    lastRender = now
    if (ambient) t += step

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

    // the world moving on its own
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
    renderer.render(scene, camera)
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
      if (debugEl) debugEl.textContent = `${fps} fps · ${renderer.info.render.calls} draws · ${Math.round(renderer.info.render.triangles / 1000)}k tris · dpr ${dpr}`
    }
  }

  const debugEl = new URLSearchParams(location.search).has('debug') ? document.createElement('div') : null
  if (debugEl) {
    debugEl.className = 'world-debug'
    container.appendChild(debugEl)
  }

  resize()
  placeCamera()
  raf = requestAnimationFrame(frame)

  window.__guildieWorld = {
    ready: true,
    screenPoint: (id) => {
      const p = project(harbor.focusPoint(id))
      if (!p.ok) return null
      const r = canvas.getBoundingClientRect()
      return { x: r.left + p.x, y: r.top + p.y }
    },
    stats: () => ({ fps, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, dpr }),
  }

  return {
    setState,
    focus(id, panelWidth) {
      goal.offset = panelWidth
      if (id) {
        goal.target.copy(harbor.focusPoint(id))
        goal.dist = Math.min(goal.dist, 44)
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
      Object.assign(goal, { yaw: HOME.yaw, pitch: HOME.pitch, dist: HOME.dist })
      goal.target.copy(homeTarget)
      wake()
    },
    dispose() {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      scene.traverse((o) => {
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
      debugEl?.remove()
      if (window.__guildieWorld) window.__guildieWorld.ready = false
    },
  }
}
