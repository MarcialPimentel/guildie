// The alchemy kit: the Alchemist (the herb beds and the alembic still), plus the guild's dress, hats and trainer in 3D.
// Picked by the guild's "kit" in content/professions.json (see guildKits.ts). The flat portraits for the menus
// are in ui/portraits/alchemy.tsx.
import * as THREE from 'three'
import * as K from '../kit'
import { C } from '../palette'
import { P, beard, chain, cone, cyl, dome, robe, sph } from '../parts'
import type { GuildKit, Workbench } from '../guildKit'

const kit: GuildKit = {
  dress: () => [robe('#1F8A87', 0.75, 0.7)],
  hats: [
    { parts: () => [P(cone(0.4, 0.8, 9), '#2A4C9A', 0, 1.73, -0.03, { rz: -0.08 }), P(cyl(0.46, 0.46, 0.06, 11), '#2A4C9A', 0, 1.36, 0), P(sph(0.09, 6, 4), '#F2C53D', 0.08, 2.12, -0.05)], top: 2.3 },
    { parts: () => [P(cyl(0.36, 0.36, 0.16, 10), '#2A4C9A', 0, 1.42, 0), P(sph(0.4, 9, 5), '#2A4C9A', 0, 1.56, -0.03, { sy: 0.45 }), P(sph(0.07, 6, 4), '#F2C53D', 0, 1.74, -0.03)] },
    { parts: () => [P(dome(0.53, 9, 3), '#1F8A87', 0, 1.1, -0.06, { sy: 0.85 }), P(cone(0.12, 0.42, 6), '#1F8A87', 0, 1.25, -0.6, { rx: -1.9 }), P(sph(0.07, 6, 4), '#F2C53D', 0, 1.1, -0.82)] },
  ],
  trainer: { skin: '#E9D5F0', prop: 'jar', top: 2.5, parts: () => [robe('#1F8A87', 1.0, 1.0, 0.64), beard(), ...chain(), P(cone(0.46, 1.0, 9), '#2A4C9A', 0, 1.86, -0.03, { rz: -0.1 }), P(cyl(0.52, 0.52, 0.06, 11), '#2A4C9A', 0, 1.37, 0), P(sph(0.1, 6, 4), '#F2C53D', 0.1, 2.36, -0.05)] },
  stationLabelY: 5.4,
  station({ grp, x, whiteMat }) {
    const sets: THREE.InstancedMesh[] = []
    for (const dx of [-1.4, 1.4]) {
      K.box(grp, 2.4, 0.7, 2.2, '#B9A27E', x + dx, 1, -3.4)
      K.box(grp, 2.1, 0.12, 1.9, '#6B4A2E', x + dx, 1.7, -3.4, false)
    }
    // a lemon-tree arch over the beds
    for (const dx of [-2.9, 2.9]) K.box(grp, 0.2, 3.4, 0.2, C.woodDark, x + dx, 1, -4.6)
    K.box(grp, 6.2, 0.2, 0.3, C.woodDark, x, 4.4, -4.6)
    for (let i = 0; i < 6; i++) K.solid(grp, new THREE.IcosahedronGeometry(0.5, 0), C.leaf, x - 2.5 + i, 4.6, -4.6)
    for (let i = 0; i < 5; i++) K.solid(grp, new THREE.IcosahedronGeometry(0.14, 0), C.lemon, x - 2 + i, 4.25, -4.4, false)
    const bed = (dx: number, n: number) => Array.from({ length: n }, (_, i) => new THREE.Vector3(x + dx - 0.75 + (i % 4) * 0.5, 1.82, -3.4 - 0.6 + Math.floor(i / 4) * 0.55))
    const leaf = new THREE.ConeGeometry(0.22, 0.7, 5)
    leaf.translate(0, 0.35, 0)
    sets.push(K.instanced(grp, leaf, whiteMat, bed(-1.4, 12), { colors: (i) => (i % 3 ? '#6E9B48' : '#F2C53D'), scale: (i) => new THREE.Vector3(1, 0.8 + (i % 3) * 0.2, 1) }))
    const moss = new THREE.IcosahedronGeometry(0.3, 0)
    moss.scale(1, 0.5, 1)
    sets.push(K.instanced(grp, moss, K.flat('#D9663A'), bed(1.4, 8), { rotY: (i) => i }))
    return sets
  },
  workbench({ grp, x }): Workbench {
    K.box(grp, 3, 1.1, 1.5, C.wood, x, 1, -2.6)                 // table
    K.cyl(grp, 0.45, 0.55, 0.5, '#3B3633', x - 0.8, 2.1, -2.6, 8)  // brazier
    const glow = new THREE.MeshStandardMaterial({ color: '#5A2A0A', emissive: '#FF8A2A', emissiveIntensity: 0.4, flatShading: true })
    const flame = K.solid(grp, new THREE.ConeGeometry(0.3, 0.7, 6), glow, x - 0.8, 2.95, -2.6, false)
    flame.userData.keep = true
    K.cyl(grp, 0.5, 0.42, 0.8, C.copper, x - 0.8, 2.6, -2.6, 10)   // copper still
    K.cyl(grp, 0.12, 0.3, 0.6, C.copper, x - 0.8, 3.4, -2.6, 8)
    const tube = K.solid(grp, new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), C.copper, x, 3.5, -2.6)
    tube.rotation.z = Math.PI / 2.6
    const glass = new THREE.MeshStandardMaterial({ color: '#9FE6DA', roughness: 0.15, transparent: true, opacity: 0.65 })
    K.solid(grp, new THREE.SphereGeometry(0.42, 12, 10), glass, x + 0.85, 2.55, -2.6, false)
    K.box(grp, 3.2, 0.12, 0.6, C.woodDark, x, 3.6, -3.9)        // shelf of jars
    for (let i = 0; i < 5; i++) K.cyl(grp, 0.16, 0.16, 0.42, ['#2FB59D', '#F2C53D', '#D9663A', '#2A4C9A', '#8F5A2B'][i], x - 1.2 + i * 0.6, 3.72, -3.9, 8)
    return { glow, anim: flame, light: '#7FE0C8', particles: 'bubbles' }
  },
}
export default kit
