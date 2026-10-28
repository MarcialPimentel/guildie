// The data the 3D harbor draws. The UI (ui/World.tsx) builds it from the server's state; the scene only
// shows it, so the server stays the only judge of results. Kept free of three.js imports so the main
// bundle can use these types without loading the 3D code.

/**
 * Places you can click. Each opens a panel with the matching game screen.
 * Harbor: station … news, plus the Duke's herald ('duke') and the Steps up to the quarters ('steps').
 * A guild quarter (0.9.0): the fountain ('duke'), the guild hall door ('trainer': reserved for the M2 guild
 * trainer, #49) and the Steps back down ('home').
 */
export type PickId = 'station' | 'workbench' | 'orders' | 'ledger' | 'bag' | 'stall' | 'mercato' | 'city' | 'news'
  | 'duke' | 'steps' | 'trainer' | 'home'

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

/** Where you are: your quay, or one of the guild quarters (named by their guild). */
export type Scene = 'harbor' | ProfessionId

/** Another merchant in the quarter (from the realtime room). */
export interface Peer {
  id: number
  name: string
  profession: ProfessionId
  look: number
  slaps: boolean
  x: number
  z: number
  h: number
  friend: boolean
}

/** A bottega around the piazza (from the server's quarter action). */
export interface StallInfo {
  id: number
  name: string
  profession: ProfessionId
  look: number
  friend: boolean
  me: boolean
  listings: number
  /** What they did lately, if they're not here now: shown as an echo at their stall. */
  echo: string | null
}

export interface WorldCallbacks {
  onPick(id: PickId): void
  /** A player (or their stall or echo) was clicked. */
  onPickPlayer?(playerId: number): void
  /** Your merchant moved (sent to the room at most 5 times a second, plus once on stopping). */
  onMove?(x: number, z: number, h: number): void
}

export interface WorldEngine {
  setState(s: WorldState): void
  /** Fly the camera to a place (or back home with null). panelWidth keeps the place clear of the side panel. */
  focus(id: PickId | null, panelWidth: number): void
  setNight(night: boolean): void
  resetView(): void
  dispose(): void

  // ---- the living city (0.9.0)
  /** Go to a scene (fades, moves your merchant to its arrival point). */
  setScene(scene: Scene, me: { look: number; slaps: boolean }): void
  /** The bottegas around the current quarter's piazza. */
  setStalls(stalls: StallInfo[]): void
  /** Labels for the quarter's places (the fountain's Duke's order progress, the guild hall). */
  setQuarterLabels(labels: Partial<Record<PickId, WorldLabel>>): void
  /** Walk your merchant to a place (the panel opens at once; this is the walk). */
  walkTo(id: PickId): void
  peerUpsert(p: Peer): void
  peerMove(id: number, x: number, z: number, h: number): void
  peerRemove(id: number): void
  peersClear(): void
  /** A wave (your own when id is yours). */
  wave(id: number): void
  /** A slap between two players (either may be you). */
  slap(from: number, to: number): void
  setSlaps(id: number, on: boolean): void
  /** The nearest other merchant within reach, or null. */
  nearestPeer(reach: number): number | null
  /** Your id, so the engine knows which slaps and waves are yours. */
  setMyId(id: number): void
  /** A short speech bubble over a player (or over you). */
  say(id: number, text: string): void

}
