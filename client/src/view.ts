// Which view the game screen uses: the 3D harbor (desktop browsers) or the classic screens (phones,
// and anyone who picks it). Override with ?view=3d or ?view=classic; the choice is remembered.
export type ViewMode = '3d' | 'classic'

const KEY = 'guildie.view'
let glCache: boolean | null = null

export function webglAvailable(): boolean {
  if (glCache !== null) return glCache
  try {
    const c = document.createElement('canvas')
    glCache = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    glCache = false
  }
  return glCache
}

/** A wide screen with a mouse: where the 3D harbor is the default (phones keep the classic view for now). */
export function isDesktop(): boolean {
  return matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches
}

function stored(): ViewMode | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === '3d' || v === 'classic' ? v : null
  } catch {
    return null
  }
}

export function rememberView(v: ViewMode): void {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    // Blocked storage: the default applies next visit.
  }
}

export function initialView(): ViewMode {
  const q = new URLSearchParams(location.search).get('view')
  if (q === '3d' || q === 'classic') rememberView(q)
  const wanted = q === '3d' || q === 'classic' ? q : stored()
  if (wanted === 'classic') return 'classic'
  if (wanted === '3d') return webglAvailable() ? '3d' : 'classic'
  return isDesktop() && webglAvailable() ? '3d' : 'classic'
}

/** Show the view switch where 3D makes sense (desktop, or a phone that asked for 3D with ?view=3d). */
export function canOffer3D(): boolean {
  return webglAvailable() && (isDesktop() || stored() === '3d')
}
