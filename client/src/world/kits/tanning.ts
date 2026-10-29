// The tanning kit: the Leatherworker (the drying racks and the tanning bench), plus the guild's dress, hats and trainer in 3D.
// Picked by the guild's "kit" in content/professions.json (see guildKits.ts). The flat portraits for the menus
// are in ui/portraits/tanning.tsx.
import * as THREE from 'three'
import * as K from '../kit'
import { C } from '../palette'
import { P, beard, box, chain, cone, cyl, dome, robe, sph } from '../parts'
import type { GuildKit, Workbench } from '../guildKit'

const kit: GuildKit = {
  dress: () => [robe('#4E6F2C', 0.95, 0.75)],
  hats: [
    { parts: () => [P(cyl(0.66, 0.66, 0.05, 13), '#E3C27A', 0, 1.38, 0), P(cyl(0.3, 0.34, 0.26, 11), '#E3C27A', 0, 1.52, 0), P(cyl(0.345, 0.345, 0.07, 11), '#A9492A', 0, 1.44, 0)] },
    { parts: () => [P(sph(0.4, 9, 4), '#4E6F2C', 0.06, 1.42, 0, { sy: 0.35 }), P(cone(0.05, 0.75, 5), '#F3D27A', 0.3, 1.66, -0.08, { rz: -0.75 })] },
    { parts: () => [P(dome(0.45, 9, 3), '#A9492A', 0, 1.24, -0.02, { sy: 0.55 }), P(box(0.36, 0.03, 0.2), '#A9492A', 0, 1.27, 0.42)] },
  ],
  trainer: { skin: '#F3D27A', prop: 'scroll', top: 2.0, parts: () => [robe('#4E6F2C', 1.0, 1.0, 0.64), beard(), ...chain(), P(cyl(0.74, 0.74, 0.05, 13), '#E3C27A', 0, 1.38, 0), P(cyl(0.32, 0.36, 0.34, 11), '#E3C27A', 0, 1.56, 0), P(cyl(0.365, 0.365, 0.08, 11), '#A9492A', 0, 1.46, 0), P(cone(0.05, 0.75, 5), '#F6EEDC', 0.32, 1.78, -0.1, { rz: -0.6 })] },
  stationLabelY: 5.4,
  station({ grp, x }) {
    const sets: THREE.InstancedMesh[] = []
    for (const dx of [-1.6, 1.6]) {
      K.box(grp, 0.2, 3.2, 0.2, C.woodDark, x + dx - 1.1, 1, -3.4)
      K.box(grp, 0.2, 3.2, 0.2, C.woodDark, x + dx + 1.1, 1, -3.4)
      K.box(grp, 2.5, 0.16, 0.16, C.woodDark, x + dx, 4.1, -3.4)
    }
    K.box(grp, 6, 0.25, 2.6, C.roofDark, x, 4.6, -4.4)   // a little shelter roof
    for (const dx of [-2.9, 2.9]) K.box(grp, 0.2, 3.6, 0.2, C.woodDark, x + dx, 1, -5.5)
    const rack = (dx: number, n: number) => Array.from({ length: n }, (_, i) => new THREE.Vector3(x + dx - 0.8 + i * (1.6 / Math.max(1, n - 1)), 3.1, -3.4 + (i % 2) * 0.12))
    const hide = new THREE.BoxGeometry(0.55, 1.8, 0.06)
    sets.push(K.instanced(grp, hide, K.flat(C.hide), rack(-1.6, 5), { rotY: (i) => (i % 2 ? 0.15 : -0.15) }))
    sets.push(K.instanced(grp, new THREE.BoxGeometry(0.7, 1.9, 0.08), K.flat(C.hideDark), rack(1.6, 4), { rotY: (i) => (i % 2 ? -0.12 : 0.12) }))
    return sets
  },
  workbench({ grp, x }): Workbench {
    K.box(grp, 3, 1.1, 1.4, C.wood, x, 1, -2.6)                 // bench
    K.box(grp, 1.6, 0.08, 1, C.hide, x - 0.4, 2.1, -2.6, false)  // leather on the bench
    for (const dx of [-1.4, 1.4]) K.box(grp, 0.12, 2.6, 0.12, C.woodDark, x + dx, 2.1, -3.6)
    K.box(grp, 2.9, 0.12, 0.12, C.woodDark, x, 4.6, -3.6)
    K.box(grp, 2.4, 2, 0.06, C.hideDark, x, 2.4, -3.6)          // a hide stretched on a frame
    K.cyl(grp, 0.75, 0.65, 1.1, C.woodDark, x + 2.2, 1, -1.6, 10) // tanning vat
    K.cyl(grp, 0.68, 0.68, 0.05, '#5A3A1E', x + 2.2, 2.08, -1.6, 10)
    const mallet = new THREE.Group()
    mallet.userData.keep = true
    mallet.position.set(x + 0.7, 2.2, -2.3)
    K.box(mallet, 0.08, 0.7, 0.08, C.woodDark, 0, 0, 0)
    K.box(mallet, 0.35, 0.22, 0.22, '#B07A4A', 0, 0.62, 0)
    grp.add(mallet)
    return { glow: null, anim: mallet, light: '#FFC27A', particles: 'dust' }
  },
}
export default kit
