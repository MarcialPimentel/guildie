// Look data shared by the 3D kit (blobs.ts) and the menus (the look picker), without three.js, so the main
// bundle can show the picker on every device. The server stores the indexes (city.php CITY_LOOKS, CITY_HATS).
import type { ProfessionId } from './types'

/** Body colors (plaster pastels). */
export const BODY_COLORS = ['#F2B98B', '#F3D27A', '#EFA9A0', '#BFE3D9', '#E9D5F0', '#F6C9A2']
export const BODY_COLOR_NAMES = ['Apricot', 'Lemon', 'Coral', 'Sea glass', 'Lavender', 'Peach']
/** Hat names per guild, in the order the server stores them. */
export const HAT_NAMES: Record<ProfessionId, string[]> = {
  blacksmith: ['Felt cap', 'Leather coif', 'Bandana'],
  alchemist: ['Pointed hat', "Scholar's cap", 'Hood'],
  leatherworker: ['Straw hat', 'Feathered beret', 'Cloth cap'],
}
export const RANK_NAMES = ['Apprentice', 'Journeyman', 'Expert', 'Master']
/** Sash color per rank (#30): none for Apprentice. */
export const SASH_COLORS: (string | null)[] = [null, '#8FD3C4', '#2A4C9A', '#F2C53D']
