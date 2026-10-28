// @ts-check
// The rules of one quarter room (docs/living-city.md section 7, systems.md 7.5), used by the realtime server
// (server.mjs) and tested on their own (test/room.test.mjs). Cosmetic only: positions, waves and
// slaps. Nothing here knows about gold or items; the PHP server stays the judge of everything with value.
//
// A "connection" is whatever the host uses for a socket; the host passes a send(conn, text) function.

/** The piazza's walkable area (client/src/world/quarter.ts uses the same numbers). */
export const BOUNDS = { minX: -21, maxX: 21, minZ: -13, maxZ: 15 }
/** Where you arrive: the top of the Steps, on the sea side of the piazza. */
export const SPAWN = { x: 0, z: 13 }
export const CAPACITY = 30
export const SLAP_REACH = 2.5
export const SLAP_COOLDOWN_MS = 1500
export const WAVE_COOLDOWN_MS = 1000
const RATE_PER_SEC = 10
const RATE_BURST = 20
const FLOOD_DROPS = 60

/**
 * @typedef {{ pid: number, n: string, p: string, l: number, s: number, exp: number }} Claims  (the signed pass)
 * @typedef {{ id: number, n: string, p: string, l: number, s: number, x: number, z: number, h: number }} Player
 * @typedef {{ player: Player, tokens: number, refill: number, drops: number, dropWindow: number, lastSlap: number, lastWave: number }} Seat
 */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const round2 = (v) => Math.round(v * 100) / 100
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export class Room {
  /**
   * @param {(conn: any, text: string) => void} send
   * @param {(conn: any, code: number, reason: string) => void} close
   * @param {{ capacity?: number, now?: () => number, onSeat?: (conn: any, player: Player) => void }} [opts]
   */
  constructor(send, close, opts = {}) {
    this.send = send
    this.close = close
    this.capacity = opts.capacity ?? CAPACITY
    this.now = opts.now ?? (() => Date.now())
    /** Called when a player's saved state changes (a host that sleeps between messages can store it on the socket). */
    this.onSeat = opts.onSeat ?? (() => {})
    /** @type {Map<any, Seat>} */
    this.seats = new Map()
  }

  get size() {
    return this.seats.size
  }

  /** Is there room for this player? (Someone already here in another tab always has room: they replace it.) */
  hasRoomFor(pid) {
    if (this.seats.size < this.capacity) return true
    for (const seat of this.seats.values()) if (seat.player.id === pid) return true
    return false
  }

  /** @param {Player} player */
  seat(conn, player) {
    const t = this.now()
    const s = { player, tokens: RATE_BURST, refill: t, drops: 0, dropWindow: t, lastSlap: 0, lastWave: 0 }
    this.seats.set(conn, s)
    return s
  }

  /** Put back a player after the host woke up from hibernation (no messages sent). */
  restore(conn, player) {
    if (player && typeof player.id === 'number') this.seat(conn, player)
  }

  /** A new connection with a verified pass. */
  join(conn, /** @type {Claims} */ claims) {
    // The same player in a second tab: the newer one wins.
    for (const [other, seat] of this.seats) {
      if (seat.player.id === claims.pid) {
        this.seats.delete(other)
        this.close(other, 4000, 'Opened in another tab')
        this.broadcast({ t: 'leave', id: claims.pid })
      }
    }
    /** @type {Player} */
    const player = { id: claims.pid, n: String(claims.n).slice(0, 20), p: String(claims.p), l: Number(claims.l) | 0, s: claims.s ? 1 : 0, x: SPAWN.x, z: SPAWN.z, h: Math.PI }
    const others = [...this.seats.values()].map((s) => s.player)
    this.seat(conn, player)
    this.onSeat(conn, player)
    this.sendTo(conn, { t: 'welcome', you: player.id, players: others, capacity: this.capacity })
    this.broadcast({ t: 'join', p: player }, conn)
  }

  leave(conn) {
    const seat = this.seats.get(conn)
    if (!seat) return
    this.seats.delete(conn)
    this.broadcast({ t: 'leave', id: seat.player.id })
  }

  /** A text message from a client. Anything malformed or too frequent is dropped. */
  message(conn, text) {
    const seat = this.seats.get(conn)
    if (!seat) return
    if (!this.allow(conn, seat)) return
    let m
    try {
      m = JSON.parse(String(text).slice(0, 512))
    } catch {
      return
    }
    if (!m || typeof m !== 'object') return
    const me = seat.player
    const t = this.now()
    switch (m.t) {
      case 'mv': {
        const x = num(m.x), z = num(m.z), h = num(m.h)
        if (x === null || z === null) return
        me.x = round2(clamp(x, BOUNDS.minX, BOUNDS.maxX))
        me.z = round2(clamp(z, BOUNDS.minZ, BOUNDS.maxZ))
        me.h = h === null ? me.h : round2(h)
        this.onSeat(conn, me)
        this.broadcast({ t: 'mv', id: me.id, x: me.x, z: me.z, h: me.h }, conn)
        return
      }
      case 'wave':
        if (t - seat.lastWave < WAVE_COOLDOWN_MS) return
        seat.lastWave = t
        this.broadcast({ t: 'wave', id: me.id })
        return
      case 'slap': {
        const target = [...this.seats.values()].find((s) => s.player.id === m.to)
        const refuse = (why) => this.sendTo(conn, { t: 'nope', why })
        if (!target || target === seat) return refuse('Nobody there.')
        if (!me.s) return refuse('Your slaps are off.')
        if (!target.player.s) return refuse(`${target.player.n} has slaps off.`)
        if (Math.hypot(target.player.x - me.x, target.player.z - me.z) > SLAP_REACH) return refuse('Too far away: walk closer.')
        if (t - seat.lastSlap < SLAP_COOLDOWN_MS) return refuse('Catch your breath first.')
        seat.lastSlap = t
        this.broadcast({ t: 'slap', from: me.id, to: target.player.id })
        return
      }
      case 'pref':
        me.s = m.s ? 1 : 0
        this.onSeat(conn, me)
        this.broadcast({ t: 'pref', id: me.id, s: me.s })
        return
      case 'hb':
        return
      default:
    }
  }

  /** Token bucket: 10 messages a second (bursts of 20). A client that keeps flooding is disconnected. */
  allow(conn, /** @type {Seat} */ seat) {
    const t = this.now()
    seat.tokens = Math.min(RATE_BURST, seat.tokens + ((t - seat.refill) / 1000) * RATE_PER_SEC)
    seat.refill = t
    if (seat.tokens >= 1) {
      seat.tokens -= 1
      return true
    }
    if (t - seat.dropWindow > 10_000) {
      seat.dropWindow = t
      seat.drops = 0
    }
    if (++seat.drops > FLOOD_DROPS) {
      this.seats.delete(conn)
      this.close(conn, 4008, 'Too many messages')
      this.broadcast({ t: 'leave', id: seat.player.id })
    }
    return false
  }

  sendTo(conn, obj) {
    try {
      this.send(conn, JSON.stringify(obj))
    } catch {
      // the socket is gone; its close event cleans up
    }
  }

  broadcast(obj, except = null) {
    const text = JSON.stringify(obj)
    for (const conn of this.seats.keys()) {
      if (conn === except) continue
      try {
        this.send(conn, text)
      } catch {
        // ignore: closed sockets leave on their own
      }
    }
  }
}

/** The quarters a room can be for (one per guild). */
export const QUARTERS = ['blacksmith', 'alchemist', 'leatherworker']
/** Copies of a quarter tried before giving up. */
export const MAX_INSTANCES = 20
