// The smith kit: the Blacksmith (the mine cart and the forge), plus the guild's dress, hats and trainer in 3D.
// Picked by the guild's "kit" in content/professions.json (see guildKits.ts). The flat portraits for the menus
// are in ui/portraits/smith.tsx.
import * as THREE from 'three'
import * as K from '../kit'
import { C } from '../palette'
import { P, apron, beard, box, chain, cone, cyl, dome, robe, sph } from '../parts'
import type { GuildKit, Workbench } from '../guildKit'

const kit: GuildKit = {
  dress: () => apron('#4B3A2E'),
  hats: [
    { parts: () => [P(cyl(0.33, 0.38, 0.24, 10), '#B83A3A', 0.02, 1.43, -0.02, { rz: 0.12 }), P(dome(0.33, 9, 3), '#B83A3A', 0.04, 1.53, -0.02, { sy: 0.55 })] },
    { parts: () => [P(dome(0.5, 9, 3), '#5A3A28', 0, 1.12, -0.03, { sy: 0.78 }), P(box(0.7, 0.08, 0.12), '#7A5233', 0, 1.2, 0.43, { rx: -0.25 })] },
    { parts: () => [P(dome(0.47, 9, 3), '#B83A3A', 0, 1.2, -0.02, { sy: 0.6 }), P(sph(0.11, 6, 4), '#B83A3A', 0, 1.25, -0.5), P(cone(0.08, 0.3, 5), '#B83A3A', 0.08, 1.1, -0.55, { rz: 0.5 })] },
  ],
  trainer: { skin: '#F6C9A2', prop: 'hammer', top: 2.05, parts: () => [robe('#4B3A2E', 1.0, 1.0, 0.62), ...apron('#6B4A35'), beard(), ...chain(), P(cyl(0.34, 0.4, 0.42, 10), '#B83A3A', 0.02, 1.58, -0.02, { rz: 0.1 }), P(dome(0.35, 9, 3), '#B83A3A', 0.04, 1.77, -0.02, { sy: 0.5 })] },
  stationLabelY: 4.9,
  station({ grp, x, rr }) {
    const sets: THREE.InstancedMesh[] = []
    K.box(grp, 2.8, 2.8, 0.2, '#2A2420', x, 1, -5.95, false)
    K.box(grp, 0.35, 3.1, 0.4, C.woodDark, x - 1.5, 1, -5.8)
    K.box(grp, 0.35, 3.1, 0.4, C.woodDark, x + 1.5, 1, -5.8)
    K.box(grp, 3.5, 0.4, 0.5, C.woodDark, x, 4, -5.8)
    for (const dx of [-0.45, 0.45]) K.box(grp, 0.1, 0.08, 4.4, C.iron, x + dx, 1, -3.6, false)
    for (let i = 0; i < 6; i++) K.box(grp, 1.4, 0.06, 0.2, C.woodDark, x, 0.99, -5.4 + i * 0.75, false)
    const g = new THREE.CylinderGeometry(0.95, 0.7, 0.9, 4, 1)
    g.rotateY(Math.PI / 4)
    const cart = K.solid(grp, g, '#7A6A5C', x, 1.75, -3.2)
    cart.scale.set(1.25, 1, 1.5)
    for (const [dx, dz] of [[-0.6, -0.7], [0.6, -0.7], [-0.6, 0.7], [0.6, 0.7]]) {
      const w = K.solid(grp, new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), C.iron, x + dx, 1.22, -3.2 + dz)
      w.rotation.z = Math.PI / 2
    }
    const spots = (n: number, y0: number) => Array.from({ length: n }, (_, i) => new THREE.Vector3(x + rr(-0.6, 0.6), y0 + Math.floor(i / 5) * 0.22 + rr(0, 0.1), -3.2 + rr(-0.8, 0.8)))
    sets.push(K.instanced(grp, new THREE.IcosahedronGeometry(0.26, 0), K.flat(C.copper), spots(10, 2.25), { rotY: (i) => i }))
    sets.push(K.instanced(grp, new THREE.IcosahedronGeometry(0.24, 0), K.flat(C.ironLight), spots(6, 2.55), { rotY: (i) => i * 2 }))
    return sets
  },
  workbench({ grp, x }): Workbench {
    K.box(grp, 2.4, 1.3, 2, '#8E8378', x, 1, -2.6)
    const glow = new THREE.MeshStandardMaterial({ color: '#3A1A0A', emissive: '#FF6A1A', emissiveIntensity: 0.4, flatShading: true })
    K.box(grp, 1.9, 0.14, 1.5, glow, x, 2.3, -2.6, false)
    K.box(grp, 1, 5.6, 1, '#7C7167', x, 2.3, -3.4)
    K.box(grp, 1.9, 0.6, 1.7, '#6E655C', x, 3.9, -2.9)
    K.box(grp, 0.9, 0.5, 1.2, '#7A4E2D', x - 1.45, 1.3, -2.6)
    K.cyl(grp, 0.38, 0.42, 0.8, C.woodDark, x + 2, 1, -0.5, 8)
    K.box(grp, 1.1, 0.35, 0.5, C.iron, x + 2, 1.8, -0.5)
    const horn = K.solid(grp, new THREE.ConeGeometry(0.2, 0.55, 6), C.iron, x + 2.8, 1.98, -0.5)
    horn.rotation.z = -Math.PI / 2
    return { glow, anim: null, light: '#FF8A3D', particles: 'sparks' }
  },
}
export default kit
