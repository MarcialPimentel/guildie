// Live presence in the guild quarters (0.9.0, docs/living-city.md §7). Talks to the realtime room
// (realtime/src/room.js) over a WebSocket with a short-lived pass signed by the PHP server. Cosmetic only:
// positions, waves and slaps. If presence isn't set up (no realtime_url on the server) or the room can't be
// reached, the status says so and the quarter works without live players.
import { session } from './session'

/** A merchant as the room describes them (short keys, from the signed pass). */
export interface RoomPlayer { id: number; n: string; p: string; l: number; ht?: number; r?: number; s: number; x: number; z: number; h: number }

export type RoomEvent =
  | { t: 'welcome'; you: number; players: RoomPlayer[]; capacity: number }
  | { t: 'room'; name: string }
  | { t: 'join'; p: RoomPlayer }
  | { t: 'leave'; id: number }
  | { t: 'mv'; id: number; x: number; z: number; h: number }
  | { t: 'wave'; id: number }
  | { t: 'emote'; id: number; e: 'bow' | 'cheer' | 'shrug' }
  | { t: 'slap'; from: number; to: number }
  | { t: 'pref'; id: number; s: number }
  | { t: 'nope'; why: string }

/** off = not set up on the server; quiet = couldn't connect (retrying); replaced = opened in another tab. */
export type PresenceStatus = 'idle' | 'connecting' | 'live' | 'off' | 'quiet' | 'replaced'

const HEARTBEAT_MS = 25_000
const HIDDEN_DISCONNECT_MS = 60_000

export class Presence {
  status: PresenceStatus = 'idle'
  room = ''
  private ws: WebSocket | null = null
  private quarter: string | null = null
  private retry = 0
  private retryTimer = 0
  private beat = 0
  private hiddenTimer = 0
  private generation = 0

  constructor(private onEvent: (e: RoomEvent) => void, private onStatus: (s: PresenceStatus, room: string) => void) {
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  /** Join a quarter's room (leaves any other). */
  connect(quarter: string): void {
    if (this.quarter === quarter && this.ws) return
    this.close()
    this.quarter = quarter
    this.retry = 0
    void this.open()
  }

  /** Rejoin with a fresh pass (after your look changed, so the room shows the new one). */
  reconnect(): void {
    const q = this.quarter
    if (!q) return
    this.close()
    this.quarter = q
    this.retry = 0
    void this.open()
  }

  /** Leave the room (back to the harbor). */
  disconnect(): void {
    this.quarter = null
    this.close()
    this.set('idle')
  }

  dispose(): void {
    this.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  get live(): boolean {
    return this.status === 'live' && this.ws?.readyState === WebSocket.OPEN
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private set(s: PresenceStatus): void {
    this.status = s
    this.onStatus(s, this.room)
  }

  private close(): void {
    this.generation++
    clearTimeout(this.retryTimer)
    clearInterval(this.beat)
    const ws = this.ws
    this.ws = null
    this.room = ''
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000, 'bye')
  }

  private async open(): Promise<void> {
    const gen = ++this.generation
    const quarter = this.quarter
    if (!quarter) return
    this.set('connecting')
    const r = await session.presenceToken()
    if (gen !== this.generation) return
    if (!r.ok) return this.again()
    if (!r.data.enabled || !r.data.url || !r.data.token) return this.set('off')
    let ws: WebSocket
    try {
      ws = new WebSocket(`${r.data.url.replace(/\/$/, '')}/q/${quarter}?token=${encodeURIComponent(r.data.token)}`)
    } catch {
      return this.again()
    }
    this.ws = ws
    ws.onmessage = (e) => {
      if (gen !== this.generation) return
      let m: RoomEvent
      try {
        m = JSON.parse(String(e.data))
      } catch {
        return
      }
      if (m.t === 'room') { this.room = m.name; this.set('live') }
      if (m.t === 'welcome') { this.retry = 0; this.set('live') }
      this.onEvent(m)
    }
    ws.onopen = () => {
      clearInterval(this.beat)
      this.beat = window.setInterval(() => this.send({ t: 'hb' }), HEARTBEAT_MS)
    }
    ws.onclose = (e) => {
      if (gen !== this.generation) return
      clearInterval(this.beat)
      this.ws = null
      if (e.code === 4000) return this.set('replaced')
      this.again()
    }
  }

  /** Try again later (1 s, 2 s, 4 s … up to 30 s), quietly. */
  private again(): void {
    if (!this.quarter) return
    this.set('quiet')
    const wait = Math.min(30_000, 1000 * 2 ** this.retry++)
    clearTimeout(this.retryTimer)
    this.retryTimer = window.setTimeout(() => void this.open(), wait)
  }

  /** A tab left in the background for a minute leaves the room; it rejoins when you come back. */
  private onVisibility = () => {
    clearTimeout(this.hiddenTimer)
    if (document.visibilityState === 'hidden') {
      this.hiddenTimer = window.setTimeout(() => {
        if (!this.quarter) return
        const q = this.quarter
        this.close()
        this.quarter = q
        this.set('idle')
      }, HIDDEN_DISCONNECT_MS)
    } else if (this.quarter && !this.ws) {
      this.retry = 0
      void this.open()
    }
  }
}
