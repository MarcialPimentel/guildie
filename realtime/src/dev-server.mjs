// Local stand-in for the Cloudflare realtime service, for tests and local play. Same URL, same pass check,
// same room rules (room.js); rooms live in memory.
//
//   REALTIME_SECRET=<same as config.php realtime_secret> PORT=8788 CAPACITY=30 node src/dev-server.mjs
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { MAX_INSTANCES, QUARTERS, Room } from './room.js'
import { verifyToken } from './token.js'

const PORT = Number(process.env.PORT || 8788)
const SECRET = process.env.REALTIME_SECRET || ''
const CAPACITY = Number(process.env.CAPACITY || 30)
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

const server = http.createServer((req, res) => {
  const body = req.url === '/rooms'
    ? JSON.stringify(Object.fromEntries([...rooms].map(([k, r]) => [k, r.size])))
    : 'Guildie realtime (dev): ok'
  res.writeHead(200, { 'Content-Type': req.url === '/rooms' ? 'application/json' : 'text/plain', 'Access-Control-Allow-Origin': '*' })
  res.end(body)
})
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', async (req, socket, head) => {
  const reject = (code, text) => {
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }
  const url = new URL(req.url || '/', 'http://localhost')
  const m = url.pathname.match(/^\/q\/([a-z]+)$/)
  if (!m || !QUARTERS.includes(m[1])) return reject(404, 'Not Found')
  const claims = await verifyToken(url.searchParams.get('token'), SECRET)
  if (!claims) return reject(401, 'Unauthorized')
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

server.listen(PORT, () => console.log(`Guildie realtime (dev) on ws://127.0.0.1:${PORT}/q/<quarter>, ${CAPACITY} per room`))
