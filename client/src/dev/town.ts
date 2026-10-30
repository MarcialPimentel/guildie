// The town view (town.html, dev only, not in the build): the harbor or the Piazza built with the game's own
// code and lit like the harbor by day, for checking buildings and taking before/after screenshots.
import * as THREE from 'three'
import { buildHarbor } from '../world/harbor'
import { addHitBox, pickFirst } from '../world/hitBoxes'
import { buildPalazzo } from '../world/palazzo'
import { preloadTownKit } from '../world/townKit'

const q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d)
const box = document.getElementById('town')!
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
box.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const night = q.has('night')
scene.background = new THREE.Color(night ? '#0B2530' : '#BFE6EA')
scene.add(new THREE.HemisphereLight(night ? '#3A5A78' : '#E6F7F7', night ? '#1A2A30' : '#E8D3B0', night ? 0.5 : 1.3))
const sun = new THREE.DirectionalLight(night ? '#9FB8E0' : '#FFF0D2', night ? 0.5 : 2.4)
sun.position.set(-26, 38, 30)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 160 })
scene.add(sun)

async function main() {
  if (!q.has('code')) await preloadTownKit()
  const piazza = q.get('scene') === 'piazza'
  if (piazza) {
    const p = buildPalazzo()
    p.root.visible = true
    scene.add(p.root)
  } else {
    const h = buildHarbor('blacksmith', 'Marz')
    scene.add(h.root)
    if (q.has('hits')) showHits(h.picks)
  }
  if (night) scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (m && 'emissiveIntensity' in m && m.emissive && m.emissive.getHex() !== 0) m.emissiveIntensity = 1.2
  })
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600)
  hitCamera = camera
  const target = new THREE.Vector3(num('tx', piazza ? 0 : -1), num('ty', piazza ? 4 : 2), num('tz', piazza ? -6 : -2))
  const yaw = num('yaw', 0.22), pitch = num('pitch', piazza ? 0.36 : 0.48), dist = num('dist', piazza ? 70 : 92)
  camera.position.set(target.x + dist * Math.cos(pitch) * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(pitch) * Math.cos(yaw))
  camera.lookAt(target)
  const size = () => {
    renderer.setSize(box.clientWidth, box.clientHeight)
    camera.aspect = box.clientWidth / box.clientHeight
    camera.updateProjectionMatrix()
  }
  addEventListener('resize', size)
  size()
  renderer.setAnimationLoop(() => renderer.render(scene, camera))
  ;(window as unknown as { townReady: boolean }).townReady = true
}
main()

// ?hits=1 draws each place's hover box and names the place under the mouse, the way the game picks it.
let hitCamera: THREE.Camera | null = null
function showHits(picks: Map<string, THREE.Object3D[]>) {
  const mat = new THREE.MeshBasicMaterial({ color: '#E0306A', wireframe: true })
  const roots: THREE.Object3D[] = []
  for (const [id, objs] of picks) for (const obj of objs.filter((o) => o.visible)) {
    addHitBox(obj, mat)
    obj.traverse((o) => { o.userData.hit = { kind: 'place', id } })
    roots.push(obj)
  }
  const tag = document.createElement('div')
  tag.id = 'picked'
  tag.style.cssText = 'position:fixed;top:8px;left:8px;padding:4px 8px;background:#fff;font:14px sans-serif'
  document.body.appendChild(tag)
  const ray = new THREE.Raycaster()
  addEventListener('pointermove', (e) => {
    if (!hitCamera) return
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), hitCamera)
    tag.textContent = (pickFirst(ray, roots)?.object.userData.hit?.id as string) ?? '(nothing)'
  })
}
