// Room rules and pass checks (node --test). The browser test (client/tests/world.spec.ts) covers the rest.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { BOUNDS, Room, SLAP_COOLDOWN_MS } from '../src/room.js'
import { verifyToken } from '../src/token.js'

const SECRET = 'a-test-secret-of-some-length'
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const pass = (claims, secret = SECRET) => {
  const body = b64url(JSON.stringify(claims))
  return `${body}.${b64url(createHmac('sha256', secret).update(body).digest())}`
}
const claims = (pid, extra = {}) => ({ pid, n: `p${pid}`, p: 'blacksmith', l: 1, s: 1, exp: Math.floor(Date.now() / 1000) + 600, ...extra })

function setup(capacity = 30) {
  let clock = 1_000_000
  const inbox = new Map()
  const closed = []
  const room = new Room(
    (c, text) => inbox.get(c).push(JSON.parse(text)),
    (c, code) => closed.push([c, code]),
    { capacity, now: () => clock },
  )
  const conn = (pid, extra) => {
    const c = { pid }
    inbox.set(c, [])
    room.join(c, claims(pid, extra))
    return c
  }
  const said = (c, t) => inbox.get(c).filter((m) => m.t === t)
  return { room, conn, said, closed, inbox, tick: (ms) => { clock += ms } }
}

test('a genuine pass is accepted; a forged, altered or expired one is not', async () => {
  assert.equal((await verifyToken(pass(claims(7)), SECRET)).pid, 7)
  assert.equal(await verifyToken(pass(claims(7), 'another-secret-entirely'), SECRET), null)
  const [body, sig] = pass(claims(7)).split('.')
  assert.equal(await verifyToken(`${b64url(JSON.stringify(claims(8)))}.${sig}`, SECRET), null)
  assert.equal(await verifyToken(pass(claims(7, { exp: 5 })), SECRET), null)
  assert.equal(await verifyToken(`${body}`, SECRET), null)
  assert.equal(await verifyToken(pass(claims(7)), 'short'), null)
})

test('joining: welcome with who is here, others hear about it', () => {
  const { conn, said } = setup()
  const a = conn(1)
  const b = conn(2)
  assert.deepEqual(said(b, 'welcome')[0].players.map((p) => p.id), [1])
  assert.equal(said(a, 'join')[0].p.id, 2)
})

test('moves are clamped to the piazza and relayed to the others', () => {
  const { room, conn, said } = setup()
  const a = conn(1)
  const b = conn(2)
  room.message(a, JSON.stringify({ t: 'mv', x: 999, z: -999, h: 1 }))
  const mv = said(b, 'mv')[0]
  assert.deepEqual([mv.id, mv.x, mv.z], [1, BOUNDS.maxX, BOUNDS.minZ])
  assert.equal(said(a, 'mv').length, 0)
  room.message(a, 'not json')
  room.message(a, JSON.stringify({ t: 'mv', x: 'a', z: 1 }))
  assert.equal(said(b, 'mv').length, 1)
})

test('slaps need reach, both players willing, and a breather', () => {
  const { room, conn, said, tick } = setup()
  const a = conn(1)
  const b = conn(2)
  const c = conn(3, { s: 0 })
  room.message(b, JSON.stringify({ t: 'mv', x: 10, z: 0 }))
  room.message(a, JSON.stringify({ t: 'slap', to: 2 }))
  assert.match(said(a, 'nope')[0].why, /far/)
  room.message(b, JSON.stringify({ t: 'mv', x: 0, z: 12 }))
  room.message(a, JSON.stringify({ t: 'slap', to: 2 }))
  assert.deepEqual(said(c, 'slap')[0], { t: 'slap', from: 1, to: 2 })
  room.message(a, JSON.stringify({ t: 'slap', to: 2 }))
  assert.match(said(a, 'nope').at(-1).why, /breath/)
  tick(SLAP_COOLDOWN_MS + 1)
  room.message(a, JSON.stringify({ t: 'slap', to: 3 }))
  assert.match(said(a, 'nope').at(-1).why, /slaps off/)
  room.message(c, JSON.stringify({ t: 'slap', to: 1 }))
  assert.match(said(c, 'nope').at(-1).why, /Your slaps are off/)
  room.message(c, JSON.stringify({ t: 'pref', s: 1 }))
  assert.deepEqual(said(a, 'pref').at(-1), { t: 'pref', id: 3, s: 1 })
  room.message(a, JSON.stringify({ t: 'slap', to: 3 }))
  assert.equal(said(b, 'slap').length, 2)
})

test('capacity: a full room says no, but the same player in a new tab replaces the old one', () => {
  const { room, conn, closed, said } = setup(2)
  const a = conn(1)
  conn(2)
  assert.equal(room.hasRoomFor(3), false)
  assert.equal(room.hasRoomFor(1), true)
  const a2 = conn(1)
  assert.equal(room.size, 2)
  assert.deepEqual(closed[0], [a, 4000])
  assert.deepEqual(said(a2, 'welcome')[0].players.map((p) => p.id), [2])
})

test('flooding is dropped, then disconnected', () => {
  const { room, conn, closed, said } = setup()
  const a = conn(1)
  const b = conn(2)
  for (let i = 0; i < 100; i++) room.message(a, JSON.stringify({ t: 'mv', x: i % 10, z: 0 }))
  assert.ok(said(b, 'mv').length <= 20)
  assert.deepEqual(closed.at(-1), [a, 4008])
  assert.equal(said(b, 'leave').at(-1).id, 1)
})
