// The 3D harbor (desktop, 0.7.0): plays through the places against the real API, clicks a real 3D
// building through the canvas, and switches to the classic view and back. Phones keep the classic view.
import { expect, test, type Page } from '@playwright/test'

const id = (s: string) => `[data-testid="${s}"]`

async function message(page: Page, text: RegExp | string) {
  await expect(page.locator(id('message'))).toContainText(text)
}

test('a new blacksmith works the harbor in 3D', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The 3D harbor is the desktop view; phones keep the classic screens.')
  const name = `w3d${Date.now() % 1_000_000}`

  await page.goto('./')
  await page.fill(id('login-name'), name)
  await page.fill(id('login-password'), 'testpass')
  await page.click(id('register'))
  await page.click(id('join-blacksmith'))

  // The harbor loads on its own (a separate download) and shows labels from the game state.
  await expect(page.locator(`${id('world')}[data-ready="yes"]`)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator(id('view-toggle'))).toHaveText('Classic view')
  await expect(page.locator(id('world-label-station'))).toContainText('The Mine')
  await expect(page.locator(id('world-label-orders'))).toContainText('Customers')

  // Click the Mercato building itself: a real raycast through the canvas opens its panel.
  const at = await page.evaluate(() => window.__guildieWorld?.screenPoint('mercato') ?? null)
  expect(at).not.toBeNull()
  await page.mouse.click(at!.x, at!.y)
  await expect(page.locator(id('panel-mercato'))).toBeVisible()
  await expect(page.locator(id('browse-blacksmith'))).toBeVisible()

  // The station: collect from the mine.
  await page.click(id('dock-station'))
  await expect(page.locator(id('panel-station'))).toBeVisible()
  await page.click(id('collect-station'))
  await expect(page.locator(id('message'))).toBeVisible()

  // The workbench (opened from its floating label once the panel is closed): craft, see the label say
  // it's ready, then collect.
  await page.click(id('panel-close'))
  await page.click(id('world-reset'))
  await page.click(id('world-label-workbench'))
  await expect(page.locator(id('panel-workbench'))).toBeVisible()
  await page.click(id('craft-brass_fittings'))
  await message(page, /Started 1 × Brass Fittings/)
  await expect(page.locator(id('world-label-workbench'))).toContainText('ready', { timeout: 60_000 })
  await page.click(id('collect-crafts'))
  await expect(page.locator(id('crafts'))).not.toContainText('Brass Fittings ×1')
  await expect(page.locator(id('skill'))).toHaveText('Blacksmith 2/100 · Apprentice')   // 0.8.0: skill and XP
  // The guild trainer opens inside the workbench panel (0.8.0, #49).
  await page.click(id('trainer-open'))
  await expect(page.locator(id('lesson-copper_lantern'))).toContainText('Learn from skill 6')
  await page.click(id('trainer-close'))

  // Every other place opens its screen.
  await page.click(id('dock-orders'))
  await expect(page.locator(id('orders'))).toBeVisible()
  await page.click(id('dock-stall'))
  await expect(page.locator(id('my-listings'))).toBeVisible()
  await page.click(id('dock-bag'))
  await expect(page.locator(id('bag-brass_fittings'))).toBeVisible()
  await page.click(id('dock-city'))
  await expect(page.locator(id('player-me'))).toContainText(name)
  await page.click(id('dock-news'))
  await expect(page.locator(id('panel-news'))).toBeVisible()
  await page.click(id('dock-ledger'))
  await expect(page.locator(id('footer'))).toContainText(/Client .+ · Server/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.side-panel')).toHaveCount(0)

  // Night and day, and a sanity check that the scene stays light (it draws in a few dozen GPU calls).
  await page.click(id('world-night'))
  await expect(page.locator(id('world-night'))).toHaveText('Day')
  const stats = await page.evaluate(() => window.__guildieWorld!.stats())
  expect(stats.calls).toBeGreaterThan(0)
  expect(stats.calls).toBeLessThan(150)

  // Switch to the classic view and back; the choice is remembered across reloads.
  await page.click(id('view-toggle'))
  await expect(page.locator('.tabbar button')).toHaveCount(4)
  await expect(page.locator(id('world'))).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.tabbar button')).toHaveCount(4)
  await page.click(id('view-toggle'))
  await expect(page.locator(`${id('world')}[data-ready="yes"]`)).toBeVisible({ timeout: 60_000 })
})

// The living city (0.9.0): walk your merchant, open a place, go up to a guild quarter, see a second player
// live (two browsers through the realtime room), follow their moves, slap, respect a slap opt-out, and visit
// their bottega. Needs the realtime server running locally (realtime/src/server.mjs) and realtime_url in config.php.
async function joinAs(page: Page, name: string, guild: string) {
  await page.goto('./?view=3d')
  await page.fill(id('login-name'), name)
  await page.fill(id('login-password'), 'testpass')
  await page.click(id('register'))
  await page.click(id(`join-${guild}`))
  await expect(page.locator(`${id('world')}[data-ready="yes"]`)).toBeVisible({ timeout: 60_000 })
}

async function goQuarter(page: Page, quarter: string) {
  await page.click(id('dock-steps'))
  await expect(page.locator(id('quarter-chooser'))).toBeVisible()
  await page.click(id(`go-${quarter}`))
  await expect(page.locator(`${id('world')}[data-scene="${quarter}"]`)).toBeVisible()
  await expect(page.locator(id('world-presence'))).not.toHaveAttribute('data-status', /idle|connecting/, { timeout: 20_000 })
}

const me = (page: Page) => page.evaluate(() => window.__guildieWorld!.me())
const peerLabel = (page: Page, name: string) => page.locator('[data-testid^="world-peer-"]', { hasText: name })
const peerId = async (page: Page, name: string) => Number((await peerLabel(page, name).getAttribute('data-testid'))!.replace('world-peer-', ''))

async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
}

test('the living city: walk, a quarter, a second player live, and a slap', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'The 3D city is the desktop view; phones get the quarters as lists (play.spec.ts).')
  const stamp = Date.now() % 1_000_000
  const nameA = `lca${stamp}`, nameB = `lcb${stamp}`
  const opts = { baseURL: info.project.use.baseURL, viewport: { width: 1280, height: 860 } }
  const ctxA = await browser.newContext(opts)
  const ctxB = await browser.newContext(opts)
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()

  // Walk: WASD moves your merchant on the quay.
  await joinAs(a, nameA, 'blacksmith')
  const start = await me(a)
  await a.locator('.world-canvas').focus()
  await hold(a, 'd', 900)
  await expect.poll(async () => (await me(a)).x).toBeGreaterThan(start.x + 1)

  // Open a place: the Duke's herald on the quay opens the Duke's order (and your merchant walks there).
  await a.click(id('world-label-duke'))
  await expect(a.locator(id('panel-duke'))).toBeVisible()
  await expect(a.locator(id('duke'))).toBeVisible()
  await a.keyboard.press('Escape')

  // Up the Steps to the Smiths' quarter.
  await goQuarter(a, 'blacksmith')
  const presence = await a.locator(id('world-presence')).getAttribute('data-status')
  test.skip(presence === 'off', 'Presence is off: set realtime_url and realtime_secret in config.php and run the realtime test server.')
  await expect(a.locator(id('world-presence'))).toHaveAttribute('data-status', 'live')
  await expect.poll(async () => (await me(a)).scene).toBe('blacksmith')   // after the fade

  // A second player (another browser) arrives: each sees the other, live.
  await joinAs(b, nameB, 'alchemist')
  await goQuarter(b, 'blacksmith')
  await expect(b.locator(id('world-presence'))).toHaveAttribute('data-status', 'live')
  await expect(peerLabel(a, nameB)).toBeVisible()
  await expect(peerLabel(b, nameA)).toBeVisible()
  const idA = await peerId(b, nameA)
  const idB = await peerId(a, nameB)
  await expect(a.locator(id('world-presence'))).toContainText(/[1-9]\d* other merchants? here/)

  // Both arrived at the top of the Steps, so they're within reach: A slaps B, and B sees it.
  await a.locator('.world-canvas').focus()
  await a.keyboard.press('f')
  await expect.poll(() => b.evaluate(() => window.__guildieWorld!.lastSlap)).toEqual({ from: idA, to: idB })
  await expect(b.locator(id('world-bubble'))).toContainText('Challenge!')
  await expect.poll(() => a.evaluate(() => window.__guildieWorld!.lastSlap)).toEqual({ from: idA, to: idB })

  // B turns slaps off: A's next slap is refused by the room, and B wears the white flag.
  await b.click(id('world-slaps'))
  await expect(b.locator(id('world-slaps'))).toHaveText('Slaps: off')
  await a.waitForTimeout(1600)   // the slapper's breather
  await a.click(id('world-slap'))
  await message(a, /slaps off/)

  // A walks; B sees A's merchant move.
  const before = await b.evaluate((pid) => window.__guildieWorld!.peer(pid), idA)
  await a.locator('.world-canvas').focus()
  await hold(a, 'a', 900)
  await expect.poll(async () => (await b.evaluate((pid) => window.__guildieWorld!.peer(pid), idA))!.x, { timeout: 10_000 }).toBeLessThan(before!.x - 1)

  // Tap the other player: their bottega opens (shop window, trade, add a friend).
  await a.click(id(`world-peer-${idB}`))
  await expect(a.locator(id('panel-visit'))).toBeVisible()
  await expect(a.locator(id('profile'))).toContainText(nameB)
  await a.click(id('friend-add'))
  await message(a, /now your friend/)
  await expect(a.locator(id('world-peer-' + idB))).toContainText('★')
  await a.click(id('propose-trade'))
  await expect(a.locator(id('compose'))).toBeVisible()
  await a.click(id('panel-close'))

  // The quarter's guild hall door: the guild trainer (0.8.0).
  await a.click(id('dock-trainer'))
  await expect(a.locator(id('panel-trainer'))).toBeVisible()
  await expect(a.locator(id('trainer'))).toBeVisible()
  await a.click(id('panel-close'))

  // B leaves: A no longer sees them. Then A goes home down the Steps.
  await b.click(id('dock-home'))
  await expect(a.locator(`[data-testid="world-peer-${idB}"]`)).toHaveCount(0)
  await a.click(id('dock-home'))
  await expect(a.locator(`${id('world')}[data-scene="harbor"]`)).toBeVisible()
  await expect(a.locator(id('world-label-mercato'))).toBeVisible()

  await ctxA.close()
  await ctxB.close()
})
