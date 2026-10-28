// The data the 3D harbor draws. The UI (ui/World.tsx) builds it from the server's state; the scene only
// shows it, so the server stays the only judge of results. Kept free of three.js imports so the main
// bundle can use these types without loading the 3D code.

/** Places you can click in the harbor. Each opens a panel with the matching game screen. */
export type PickId = 'station' | 'workbench' | 'orders' | 'ledger' | 'bag' | 'stall' | 'mercato' | 'city' | 'news'

export type ProfessionId = 'blacksmith' | 'alchemist' | 'leatherworker'

export interface WorldLabel {
  text: string
  /** 'ready' = something to collect or fill (lemon), 'alert' = full or urgent, 'plain' otherwise. */
  tone: 'plain' | 'ready' | 'alert'
}

export interface WorldState {
  profession: ProfessionId
  playerName: string
  /** Each station output's fill, 0..1 (estimated between refreshes the same way the classic screen does). */
  stationFill: number[]
  /** Crafts running or done. */
  crafting: { active: number; ready: number }
  /** Different items in the bag (crates outside the storehouse). */
  bagKinds: number
  listings: number
  /** Up to three customers at the door. */
  customers: { kind: string; ready: boolean }[]
  /** A world event is running (a galley docks in the harbor). */
  eventNow: boolean
  /** The Regatta is on (bunting along the quay). */
  festival: boolean
  labels: Partial<Record<PickId, WorldLabel>>
}

export interface WorldCallbacks {
  onPick(id: PickId): void
}

export interface WorldEngine {
  setState(s: WorldState): void
  /** Fly the camera to a place (or back home with null). panelWidth keeps the place clear of the side panel. */
  focus(id: PickId | null, panelWidth: number): void
  setNight(night: boolean): void
  resetView(): void
  dispose(): void
}
