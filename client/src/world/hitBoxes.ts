// Hover boxes: every place gets an invisible box around its whole shape (0.10.2), so thin things (the trapper's
// lodge, the Duke's notice board, a door) are as easy to point at as a solid building. The box is padded a
// little; where two padded boxes overlap, the place whose own (unpadded) shape the pointer is over wins (0.17.2).
import * as THREE from 'three'

/** Add a hover box around everything inside `obj`. */
export function addHitBox(obj: THREE.Object3D, material: THREE.Material, pad = 0.35) {
  obj.updateWorldMatrix(true, true)
  const box = new THREE.Box3()
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || o.userData.hitBox || !m.geometry) return
    // An instanced mesh (a row of crates, a stall's goods) spans all its copies, not just its one shape.
    const inst = o as THREE.InstancedMesh
    let own: THREE.Box3
    if (inst.isInstancedMesh) {
      const shown = inst.count   // count all the copies, even ones hidden for now (crates appear as the bag fills)
      inst.count = inst.instanceMatrix.count
      inst.computeBoundingBox()
      inst.count = shown
      own = inst.boundingBox!
    } else {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
      own = m.geometry.boundingBox!
    }
    box.union(own.clone().applyMatrix4(m.matrixWorld))
  })
  if (box.isEmpty()) return
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2 * half.x + 2 * pad, 2 * half.y + 2 * pad, 2 * half.z + 2 * pad), material)
  box.getCenter(mesh.position)
  mesh.userData.hitBox = true
  mesh.userData.core = new THREE.Box3(half.clone().negate(), half)   // the unpadded box, in the box's own space
  obj.attach(mesh)   // keeps the world position; moves with the place from now on
}

const inverse = new THREE.Matrix4()
const local = new THREE.Ray()
/** Is the ray over this hit's own shape, not just its padding? (Boxes without a core, like people, always are.) */
const overCore = (ray: THREE.Ray, h: THREE.Intersection) => {
  const core = h.object.userData.core as THREE.Box3 | undefined
  if (!core) return true
  local.copy(ray).applyMatrix4(inverse.copy(h.object.matrixWorld).invert())
  return local.intersectsBox(core)
}

/** The nearest pickable thing under the ray: a hit on a place's own shape beats a hit on another's padding. */
export function pickFirst(ray: THREE.Raycaster, roots: THREE.Object3D[]): THREE.Intersection | undefined {
  const hits = ray.intersectObjects(roots, true).filter((h) => h.object.visible && h.object.userData.hit)
  return hits.find((h) => overCore(ray.ray, h)) ?? hits[0]
}
