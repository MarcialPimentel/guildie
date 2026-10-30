// The cast sheet (cast.html, dev only, not in the build): every player look, guild trainer and NPC side by
// side, built with the game's own character code and lit like the harbor by day. For checking a change to
// the body model or the parts table: clothes poking through, faces hidden by hats, sizes.
import * as THREE from 'three'
import { GUILDS } from '../guilds'
import { Blob, NPC_IDS, preloadBlobModel, type BlobOptions } from '../world/blobs'

const q = new URLSearchParams(location.search)
const box = document.getElementById('cast')!
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
box.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#BFE6EA')
scene.add(new THREE.HemisphereLight('#E6F7F7', '#E8D3B0', 1.3))
const sun = new THREE.DirectionalLight('#FFF0D2', 2.4)
sun.position.set(-26, 38, 30)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 130 })
scene.add(sun)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#E8DCC4' }))
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

async function main() {
  if (!q.has('code')) await preloadBlobModel()
  const rows: BlobOptions[][] = [
    ...GUILDS.map((g) => [0, 1, 2].map((hat): BlobOptions => ({ character: g.id, hat, look: hat * 2, rank: hat + 1 }))
      .concat([{ character: `trainer:${g.id}` }])),
    NPC_IDS.slice(0, 12).map((character) => ({ character })),
    NPC_IDS.slice(12).map((character) => ({ character })),
  ].slice(0, q.has('players') ? GUILDS.length : undefined)
  const blobs: Blob[] = []
  const gap = 2.2
  rows.forEach((row, r) => row.forEach((o, i) => {
    const b = new Blob(o)
    b.idles = false
    b.root.position.set((i - (row.length - 1) / 2) * gap, 0, (r - rows.length / 2) * gap * 1.3)
    b.root.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true })
    scene.add(b.root)
    blobs.push(b)
  }))
  const near = q.has('near')
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 500)
  camera.position.set(0, near ? 9 : 26, near ? 22 : 42)
  camera.lookAt(0, 1, near ? -2 : 0)
  const size = () => {
    const w = box.clientWidth, h = box.clientHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  addEventListener('resize', size)
  size()
  let last = performance.now()
  renderer.setAnimationLoop((t) => {
    const dt = Math.min((t - last) / 1000, 0.1)
    last = t
    // ?anim=walk: everyone walks on the spot; ?anim=slap: everyone is slapped from their left every 2 s
    const anim = q.get('anim')
    if (anim === 'slap' && Math.floor(t / 2000) !== Math.floor((t - dt * 1000) / 2000)) for (const b of blobs) b.slapped(new THREE.Vector3(1, 0, 0))
    for (const b of blobs) b.update(dt, anim === 'walk' ? 2.5 : 0, anim === null)
    renderer.render(scene, camera)
  })
  ;(window as unknown as { castReady: boolean }).castReady = true
}
main()
