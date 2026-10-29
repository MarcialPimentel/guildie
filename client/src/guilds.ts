// The guilds, read from content/professions.json at build time: the one source of truth for a guild's names,
// colors and hats, shared with the server (city.php, professions.php) and the realtime rooms. Nothing in the
// client lists the guilds by hand; adding a guild is a content change plus its art kit (see docs/professions.md
// "Adding a guild"). No three.js here, so the menus can use it on every device.
import content from '../../content/professions.json'

export interface Guild {
  id: string
  name: string
  /** The art kit: client/src/world/kits/<kit>.ts (3D) and client/src/ui/portraits/<kit>.tsx (menus). */
  kit: string
  /** The guild hall on the quarter's north side, e.g. "Arte dei Fabbri". */
  hall: string
  /** The quarter's square, e.g. "Piazza dei Fabbri". */
  piazza: string
  /** The short label for the quarter tabs, e.g. "Smiths'". */
  quarter: string
  /** The Mercato heading for the guild's goods. */
  goods: string
  /** What the workbench is called on your quay. */
  workbench: string
  color: string
  trim: string
  /** Hat names, in the order the server stores the hat index. */
  hats: string[]
}

export const GUILDS: Guild[] = content.professions.map((p) => ({ id: p.id, name: p.name, ...p.guild }))

const BY_ID = new Map(GUILDS.map((g) => [g.id, g]))

/** Is this a guild id this build knows? */
export const isGuildId = (id: string): boolean => BY_ID.has(id)

/**
 * A guild by id. An id this build doesn't know (a newer server during a deploy) gets plain labels instead of
 * a crash; the 3D kit logs the problem (world/guildKits.ts).
 */
export function guild(id: string): Guild {
  return BY_ID.get(id) ?? {
    id, name: id, kit: '', hall: 'Guild hall', piazza: 'Piazza', quarter: id, goods: `${id} goods`, workbench: 'Workbench',
    color: '#8A8F96', trim: '#5A3A28', hats: ['Cap'],
  }
}
