// Look data shared by the 3D kit (blobs.ts) and the menus (the look picker), without three.js, so the main
// bundle can show the picker on every device. Hat names are content (src/guilds.ts); the server stores the indexes.

/** Body colors (plaster pastels). */
export const BODY_COLORS = ['#F2B98B', '#F3D27A', '#EFA9A0', '#BFE3D9', '#E9D5F0', '#F6C9A2']
export const BODY_COLOR_NAMES = ['Apricot', 'Lemon', 'Coral', 'Sea glass', 'Lavender', 'Peach']
export const RANK_NAMES = ['Apprentice', 'Journeyman', 'Expert', 'Master']
/** Sash color per rank (#30): none for Apprentice. */
export const SASH_COLORS: (string | null)[] = [null, '#8FD3C4', '#2A4C9A', '#F2C53D']
