// @ts-check
// Guildie's realtime service on Cloudflare (docs/living-city.md section 7, docs/realtime-setup.md).
// One Durable Object per quarter copy ("blacksmith-1", "blacksmith-2", ...) holds the WebSockets of the
// players in that piazza and relays positions, waves and slaps (room.js). Cosmetic only: it never sees
// gold or items. Rooms use the WebSocket Hibernation API, so an idle room costs nothing.
//
//   wss://<worker>/q/<quarter>?token=<presence pass from the PHP server>
//
// Settings (wrangler.toml [vars] and secrets): REALTIME_SECRET (secret, same as config.php
// realtime_secret), ALLOWED_ORIGINS (comma-separated, e.g. "https://marz.gg"), CAPACITY (default 30).
import { MAX_INSTANCES, QUARTERS, Room } from './room.js'
import { verifyToken } from './token.js'

export default {
  /** @param {Request} req @param {any} env */
  async fetch(req, env) {
    const url = new URL(req.url)
    if (url.pathname === '/' || url.pathname === '/health') return new Response('Guildie realtime: ok')
    const m = url.pathname.match(/^\/q\/([a-z]+)$/)
    if (!m || !QUARTERS.includes(m[1])) return new Response('Not found', { status: 404 })
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })

    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
    const origin = req.headers.get('Origin') || ''
    if (allowed.length && !allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 })

    const claims = await verifyToken(url.searchParams.get('token'), env.REALTIME_SECRET)
    if (!claims) return new Response('Bad or expired pass', { status: 401 })

    // The first copy of the quarter with room takes the player.
    for (let n = 1; n <= MAX_INSTANCES; n++) {
      const name = `${m[1]}-${n}`
      const stub = env.QUARTER.get(env.QUARTER.idFromName(name))
      const headers = new Headers(req.headers)
      headers.set('X-Guildie-Claims', JSON.stringify(claims))
      headers.set('X-Guildie-Room', name)
      const res = await stub.fetch(new Request(`https://room/${name}`, { headers }))
      if (res.status !== 409) return res
    }
    return new Response('Every copy of this quarter is full', { status: 503 })
  },
}

export class QuarterRoom {
  /** @param {any} state @param {any} env */
  constructor(state, env) {
    this.state = state
    this.room = new Room(
      (ws, text) => ws.send(text),
      (ws, code, reason) => { try { ws.close(code, reason) } catch { /* already closed */ } },
      { capacity: Number(env.CAPACITY) || 30, onSeat: (ws, player) => ws.serializeAttachment(player) },
    )
    // Waking from hibernation: put everyone back from what was saved on their sockets.
    for (const ws of state.getWebSockets()) this.room.restore(ws, ws.deserializeAttachment())
    // Heartbeats are answered without waking the room.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"hb"}', '{"t":"hb"}'))
  }

  /** @param {Request} req */
  async fetch(req) {
    const claims = JSON.parse(req.headers.get('X-Guildie-Claims') || 'null')
    if (!claims) return new Response('Missing pass', { status: 400 })
    if (!this.room.hasRoomFor(claims.pid)) return new Response('Full', { status: 409 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.state.acceptWebSocket(server)
    this.room.join(server, claims)
    server.send(JSON.stringify({ t: 'room', name: req.headers.get('X-Guildie-Room') }))
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(ws, message) {
    this.room.message(ws, typeof message === 'string' ? message : '')
  }

  webSocketClose(ws, code) {
    this.room.leave(ws)
    try { ws.close(code === 1005 ? 1000 : code, 'bye') } catch { /* already closed */ }
  }

  webSocketError(ws) {
    this.room.leave(ws)
  }
}
