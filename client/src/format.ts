// Small formatting helpers shared by the screens.

export function number(n: number): string {
  return Math.trunc(n).toLocaleString('en-US')
}

/** Money in text, e.g. "1,250 ducats" (the server still calls it gold). On screen, prefer <Coins> (ui/art.tsx). */
export function gold(n: number): string {
  return `${number(n)} ${Math.trunc(n) === 1 ? 'ducat' : 'ducats'}`
}

/** 75 -> "1m 15s", 3700 -> "1h 1m" */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}

/** "now", "5m ago", "3h ago", "2d ago" */
export function ago(seconds: number): string {
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/** City: when a player was last active. */
export function seen(seconds: number | null): string {
  if (seconds === null) return 'never seen'
  if (seconds < 600) return 'active now'
  return `seen ${ago(seconds)}`
}

export function trimNumber(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export const CLIENT_BUILD: string = typeof __CLIENT_BUILD__ === 'string' ? __CLIENT_BUILD__ : 'dev'
