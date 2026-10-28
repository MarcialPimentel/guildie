// Guildie's realtime rooms (the living city, docs/living-city.md §7): a small Node server that holds one room
// per quarter copy ("blacksmith-1", "blacksmith-2", …) and relays positions, waves and slaps (room.js).
// Cosmetic only: it never sees ducats or items, and keeps nothing on disk. In production it runs as a
// Docker container on the DigitalOcean droplet behind Caddy (HTTPS); tests and local play run it directly.
//
//   wss://<host>/q/<quarter>?token=<presence pass signed by the PHP server>
//
// Settings (environment):
//   REALTIME_SECRET   required, at least 16 characters; the same as config.php realtime_secret
//   PORT              default 8788
//   CAPACITY          players per room copy, default 30
//   ALLOWED_ORIGINS   comma-separated pages allowed to connect, e.g. "https://marz.gg,https://www.marz.gg";
//                     empty = any (tests and local play)
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { MAX_INSTANCES, QUARTERS, Room } from './room.js'
import { verifyToken } from './token.js'

const PORT = Number(process.env.PORT || 8788)
const SECRET = process.env.REALTIME_SECRET || ''
const CAPACITY = Number(process.env.CAPACITY || 30)
const ORIGINS = String(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
if (SECRET.length < 16) {
  console.error('Set REALTIME_SECRET (at least 16 characters, the same as config.php realtime_secret).')
  process.exit(1)
}

/** @type {Map<string, Room>} */
const rooms = new Map()
const roomFor = (name) => {
  let r = rooms.get(name)
  if (!r) {
    r = new Room((ws, text) => ws.send(text), (ws, code, reason) => ws.close(code, reason), { capacity: CAPACITY })
    rooms.set(name, r)
  }
  return r
}
const players = () => [...rooms.values()].reduce((n, r) => n + r.size, 0)

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/rooms') {
    const body = req.url === '/health'
      ? { ok: true, rooms: [...rooms.values()].filter((r) => r.size > 0).length, players: players() }
      : Object.fromEntries([...rooms].filter(([, r]) => r.size > 0).map(([k, r]) => [k, r.size]))
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify(body))
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
  res.end('Guildie realtime: ok')
})
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 })

server.on('upgrade', async (req, socket, head) => {
  const reject = (code, text) => {
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }
  const url = new URL(req.url || '/', 'http://localhost')
  const m = url.pathname.match(/^\/q\/([a-z]+)$/)
  if (!m || !QUARTERS.includes(m[1])) return reject(404, 'Not Found')
  if (ORIGINS.length && !ORIGINS.includes(String(req.headers.origin || ''))) return reject(403, 'Forbidden')
  const claims = await verifyToken(url.searchParams.get('token'), SECRET)
  if (!claims) return reject(401, 'Unauthorized')
  // The first copy of the quarter with room takes the player.
  let name = null
  for (let n = 1; n <= MAX_INSTANCES && !name; n++) if (roomFor(`${m[1]}-${n}`).hasRoomFor(claims.pid)) name = `${m[1]}-${n}`
  if (!name) return reject(503, 'Service Unavailable')
  const room = roomFor(name)
  wss.handleUpgrade(req, socket, head, (ws) => {
    room.join(ws, claims)
    ws.send(JSON.stringify({ t: 'room', name }))
    ws.on('message', (data) => {
      const text = data.toString()
      if (text === '{"t":"hb"}') return ws.send(text)
      room.message(ws, text)
    })
    ws.on('close', () => room.leave(ws))
    ws.on('error', () => room.leave(ws))
  })
})

// On a deploy (SIGTERM) or Ctrl+C: tell everyone, so their browsers reconnect to the new container.
const shutdown = () => {
  for (const ws of wss.clients) ws.close(1012, 'Restarting')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

server.listen(PORT, () => console.log(
  `Guildie realtime on port ${PORT}: ws://…/q/<quarter>, ${CAPACITY} per room, origins: ${ORIGINS.length ? ORIGINS.join(' ') : 'any'}`,
))
