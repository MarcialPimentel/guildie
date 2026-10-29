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

/** A guild id from content/professions.json (see src/guilds.ts). Not a fixed list: guilds are content. */
export type ProfessionId = string

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
  /** Up to three customers at the door: the order id, who they are (content/orders.json id) and their line. */
  customers: { order: number; customer: string; name: string; line: string; kind: string; ready: boolean }[]
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
  /** Hat 0-2 and rank 0-3 (0.10.0; from the signed presence pass). */
  hat: number
  rank: number
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
  hat: number
  rank: number
  friend: boolean
  me: boolean
  listings: number
  /** What they did lately, if they're not here now: shown as an echo at their stall. */
  echo: string | null
}

/** How your own merchant looks (from the presence pass) and whether your slaps are on. */
export interface MyLook { look: number; hat: number; rank: number; slaps: boolean }

/** Emotes anyone can play in a quarter (the realtime room relays them; 0.10.0). */
export type RoomEmote = 'wave' | 'bow' | 'cheer' | 'shrug'

/** A sale the server already made, for a buyer who walks up to your stall: persona id, or 'player'. */
export interface SaleShow { buyer: string; text: string }

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
  setScene(scene: Scene, me: MyLook): void
  /** Your look changed (the "Your look" sheet); also works mid-scene. */
  setMyLook(me: MyLook): void
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
  /** A bow, cheer or shrug (or a wave). */
  emote(id: number, e: RoomEmote): void
  /** The server filled this order: your merchant hands the goods over, the customer pays (text) and leaves. */
  orderFilled(order: number, text: string): void
  /** You turned this order down: the customer shrugs and leaves. */
  orderTurnedDown(order: number): void
  /** Sales the server made since you last looked: up to 3 buyers walk to your stall; `more` are summed up. */
  sales(list: SaleShow[], more: number): void
  /** The Duke's herald blows the trumpet and announces something (a new or a fulfilled Duke's order). */
  herald(text: string): void
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
