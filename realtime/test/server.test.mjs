// The real server process (server.mjs): health, the website check, pass checks, and two players in one room.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import WebSocket from 'ws'

const SECRET = 'a-test-secret-of-some-length'
const PORT = 18700 + Math.floor(Math.random() * 200)
const ORIGIN = 'https://marz.gg'
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const pass = (pid, extra = {}) => {
  const body = b64url(JSON.stringify({ pid, n: `p${pid}`, p: 'alchemist', l: 2, s: 1, exp: Math.floor(Date.now() / 1000) + 600, ...extra }))
  return `${body}.${b64url(createHmac('sha256', SECRET).update(body).digest())}`
}
const url = (token, quarter = 'alchemist') => `ws://127.0.0.1:${PORT}/q/${quarter}?token=${encodeURIComponent(token)}`

/** Open a socket; resolves with { ws, messages } once it's open, or { status } if the server refused it. */
const connect = (address, origin = ORIGIN) => new Promise((resolve) => {
  const ws = new WebSocket(address, { origin })
  const messages = []
  ws.on('message', (d) => messages.push(JSON.parse(d.toString())))
  ws.on('open', () => resolve({ ws, messages }))
  ws.on('unexpected-response', (_, res) => resolve({ status: res.statusCode }))
  ws.on('error', () => {})
})
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return false
}

let proc
test.before(async () => {
  proc = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    env: { ...process.env, REALTIME_SECRET: SECRET, PORT: String(PORT), ALLOWED_ORIGINS: `${ORIGIN},https://www.marz.gg` },
    stdio: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('server did not start')
})
test.after(() => proc?.kill('SIGTERM'))

test('health answers', async () => {
  const h = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json()
  assert.equal(h.ok, true)
})

test('only the game\'s own website may connect', async () => {
  assert.equal((await connect(url(pass(1)), 'https://evil.example')).status, 403)
})

test('a forged pass or an unknown quarter is refused', async () => {
  assert.equal((await connect(url(pass(1).slice(0, -2) + 'xx'))).status, 401)
  assert.equal((await connect(url(pass(1), 'wizards'))).status, 404)
})

test('the quarters come from the pass, so a new guild needs no change here', async () => {
  const q = ['blacksmith', 'alchemist', 'leatherworker', 'glassblower']
  const a = await connect(url(pass(21, { q }), 'glassblower'))
  assert.ok(a.ws, 'a quarter listed in the pass opens')
  a.ws.close()
  assert.equal((await connect(url(pass(22, { q }), 'wizards'))).status, 404)
  assert.equal((await connect(url(pass(23), 'glassblower'))).status, 404, 'a pass without a list allows only the original three')
})

test('two players in one room see each other move', async () => {
  const a = await connect(url(pass(11)))
  const b = await connect(url(pass(12)))
  assert.ok(a.ws && b.ws)
  assert.ok(await until(() => a.messages.some((m) => m.t === 'join' && m.p.id === 12)))
  assert.deepEqual(b.messages.find((m) => m.t === 'welcome').players.map((p) => p.id), [11])
  assert.equal(b.messages.find((m) => m.t === 'room').name, 'alchemist-1')
  a.ws.send(JSON.stringify({ t: 'mv', x: 3, z: 4, h: 1 }))
  assert.ok(await until(() => b.messages.some((m) => m.t === 'mv' && m.id === 11 && m.x === 3)))
  a.ws.close()
  assert.ok(await until(() => b.messages.some((m) => m.t === 'leave' && m.id === 11)))
  b.ws.close()
})
