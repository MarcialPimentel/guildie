// The 3D kits, found by file name: kits/<kit>.ts is the kit named <kit> in content/professions.json.
// tools/validate_content.py checks that every guild's kit file exists, so a missing kit fails CI instead of
// quietly borrowing another guild's art.
import { guild } from '../guilds'
import type { GuildKit } from './guildKit'
import * as K from './kit'
import { P, dome, robe } from './parts'

export const KITS: Record<string, GuildKit> = Object.fromEntries(
  Object.entries(import.meta.glob<GuildKit>('./kits/*.ts', { eager: true, import: 'default' }))
    .map(([path, kit]) => [path.slice(path.lastIndexOf('/') + 1, -3), kit]),
)

/** Plain art for a guild this build has no kit for: a grey smock, a cap, a table and a crate. */
const PLAIN: GuildKit = {
  dress: () => [robe('#8A8F96', 0.85, 0.7)],
  hats: [{ parts: () => [P(dome(0.42, 9, 3), '#5A3A28', 0, 1.22, -0.02, { sy: 0.7 })] }],
  trainer: { skin: '#F6C9A2', prop: 'scroll', top: 1.9, parts: () => [robe('#5A3A28', 1.0, 1.0, 0.62)] },
  stationLabelY: 5.4,
  station: ({ grp, x }) => {
    K.box(grp, 1.6, 1.2, 1.6, '#B5833E', x, 1, -3.4)
    return []
  },
  workbench: ({ grp, x }) => {
    K.box(grp, 3, 1.1, 1.4, '#A9784A', x, 1, -2.6)
    return { glow: null, anim: null, light: '#FFC27A', particles: 'dust' }
  },
}

const warned = new Set<string>()

/** The 3D kit for a guild id. A guild without a kit gets plain art and one console error, never a crash. */
export function kitFor(guildId: string): GuildKit {
  const kit = KITS[guild(guildId).kit]
  if (kit) return kit
  if (!warned.has(guildId)) {
    warned.add(guildId)
    console.error(`Guildie: no 3D kit for guild "${guildId}" (kit "${guild(guildId).kit}"); using plain art.`)
  }
  return PLAIN
}
