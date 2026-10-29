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
  await page.click(id('look-color-1'))
  await page.click(id('hat-blacksmith-2'))
  await page.click(id('join-blacksmith'))

  // The harbor loads on its own (a separate download) and shows labels from the game state.
  await expect(page.locator(`${id('world')}[data-ready="yes"]`)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator(id('view-toggle'))).toHaveText('Classic view')
  await expect(page.locator(id('world-label-station'))).toContainText('The Mine')
  await expect(page.locator(id('world-label-orders'))).toContainText('Customers')

  // 0.10.0: the customers at your door are the named order customers (blobs with their own look), and
  // someone who chose a look when joining isn't invited to choose again.
  await expect.poll(() => page.evaluate(() => window.__guildieWorld!.customers().filter((c) => c.state === 'waiting').length), { timeout: 30_000 }).toBe(3)
  const known = ['lady_ashworth', 'squire_pell', 'mother_hale', 'foreman_grigg', 'captain_vos', 'brother_amon', 'madame_orsini', 'collector_quill', 'collector_marchesa']
  expect((await page.evaluate(() => window.__guildieWorld!.customers())).every((c) => known.includes(c.character))).toBe(true)
  await expect(page.locator(id('look-invite'))).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__guildieWorld!.me())).toMatchObject({ look: 1, hat: 2, rank: 0 })

  // Pointing at a place lights up its label (0.10.2: an invisible hover box covers the whole shape, so the
  // gaps in the mine's frame count too), and the label stays where it was.
  const mine = await page.evaluate(() => window.__guildieWorld?.screenPoint('station') ?? null)
  const before = await page.locator(id('world-label-station')).boundingBox()
  // (A real mouse sends many moves; the test sends one, so it moves again until the first frames have settled.)
  await expect(async () => {
    await page.mouse.move(5, 5)
    await page.mouse.move(mine!.x, mine!.y)
    await expect(page.locator(id('world-label-station'))).toHaveClass(/hover/, { timeout: 1500 })
  }).toPass({ timeout: 20_000 })
  expect(await page.locator(id('world-label-station')).boundingBox()).toEqual(before)
  await page.mouse.move(5, 5)

  // Click the storehouse itself: a real raycast through the canvas opens its panel.
  const at = await page.evaluate(() => window.__guildieWorld?.screenPoint('bag') ?? null)
  expect(at).not.toBeNull()
  await page.mouse.click(at!.x, at!.y)
  await expect(page.locator(id('panel-bag'))).toBeVisible()
  // 0.13.0: the quay keeps only your own work; the market, the guild hall, the news and the Duke moved up to the Palazzo.
  // (the Duke's label exists for the Palazzo's lectern, hidden while you're on the quay)
  for (const gone of ['mercato', 'stall', 'city', 'news', 'duke']) await expect(page.locator(id(`world-label-${gone}`))).toBeHidden()
  await expect(page.locator(id('dock-steps'))).toHaveText('Up to the Palazzo')

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
  // Turning an order down: that customer shrugs and walks off (0.10.0).
  const waiting = (await page.evaluate(() => window.__guildieWorld!.customers())).filter((c) => c.state === 'waiting').map((c) => c.order)
  await page.locator(id('order-skip')).first().click()
  await message(page, /turned down/)
  await expect.poll(async () => (await page.evaluate(() => window.__guildieWorld!.customers())).filter((c) => waiting.includes(c.order) && c.state === 'waiting').length).toBe(2)
  await page.click(id('dock-bag'))
  await expect(page.locator(id('bag-brass_fittings'))).toBeVisible()
  await page.click(id('dock-ledger'))
  await expect(page.locator(id('footer'))).toContainText(/Client .+ · Server/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.side-panel')).toHaveCount(0)

  // Your look (0.10.0): another body color and hat, saved on the server.
  await page.click(id('world-look'))
  await page.click(id('look-color-5'))
  await page.click(id('look-hat-1'))
  await page.click(id('look-save'))
  await message(page, /leather coif/)
  await expect(page.locator(id('look-sheet'))).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__guildieWorld!.me())).toMatchObject({ look: 5, hat: 1 })

  // Bow, cheer and shrug work on your own quay too (nobody else sees them there).
  await page.locator('.world-canvas').focus()
  await page.keyboard.press('2')
  await expect.poll(() => page.evaluate(() => window.__guildieWorld!.lastEmote?.e)).toBe('cheer')

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

// The living city (0.9.0; the Palazzo since 0.13.0): walk your merchant, open a place, go up to the Palazzo, see a second player
// live (two browsers through the realtime room), follow their moves, slap, respect a slap opt-out, and visit
// their bottega. Needs the realtime server running locally (realtime/src/server.mjs) and realtime_url in config.php.
async function joinAs(page: Page, name: string, guild: string, look = { color: 0, hat: 0 }) {
  await page.goto('./?view=3d')
  await page.fill(id('login-name'), name)
  await page.fill(id('login-password'), 'testpass')
  await page.click(id('register'))
  await page.click(id(`look-color-${look.color}`))
  await page.click(id(`hat-${guild}-${look.hat}`))
  await page.click(id(`join-${guild}`))
  await expect(page.locator(`${id('world')}[data-ready="yes"]`)).toBeVisible({ timeout: 60_000 })
}

/** Up the Steps: since 0.13.0 they lead straight to the Palazzo, the one shared square. */
async function goPalazzo(page: Page) {
  await page.click(id('dock-steps'))
  await expect(page.locator(`${id('world')}[data-scene="palazzo"]`)).toBeVisible()
  await expect(page.locator(id('world-presence'))).not.toHaveAttribute('data-status', /idle|connecting/, { timeout: 20_000 })
}

/**
 * A taps B (their bottega opens and A walks over), closes the panel, and waits until B sees A within reach.
 * First A must see B where B really is: right after a slap, B's step back may still be on its way to A, and
 * A would walk to where B used to stand.
 */
async function walkUpTo(a: Page, b: Page, idA: number, idB: number) {
  await expect.poll(async () => {
    const seen = await a.evaluate((pid) => window.__guildieWorld!.peer(pid), idB)
    const real = await b.evaluate(() => window.__guildieWorld!.me())
    return seen ? Math.hypot(seen.x - real.x, seen.z - real.z) : 99
  }, { timeout: 10_000 }).toBeLessThan(0.2)
  await a.click(id(`world-peer-${idB}`))
  await expect(a.locator(id('panel-visit'))).toBeVisible()
  await a.keyboard.press('Escape')
  await expect.poll(async () => {
    const pa = await b.evaluate((pid) => window.__guildieWorld!.peer(pid), idA)
    const pb = await b.evaluate(() => window.__guildieWorld!.me())
    return pa ? Math.hypot(pa.x - pb.x, pa.z - pb.z) : 99
  }, { timeout: 10_000 }).toBeLessThan(2.4)
}

const me = (page: Page) => page.evaluate(() => window.__guildieWorld!.me())
const peerLabel = (page: Page, name: string) => page.locator('[data-testid^="world-peer-"]', { hasText: name })
const peerId = async (page: Page, name: string) => Number((await peerLabel(page, name).getAttribute('data-testid'))!.replace('world-peer-', ''))

async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
}

test('the living city: walk, the Palazzo, a second player live, and a slap', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'The 3D city is the desktop view; phones get the City tab as lists (play.spec.ts).')
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

  // Open a place: the customers at your door (and your merchant walks there).
  await a.click(id('world-label-orders'))
  await expect(a.locator(id('panel-orders'))).toBeVisible()
  await a.keyboard.press('Escape')

  // Up the Steps to the Palazzo.
  await goPalazzo(a)
  const presence = await a.locator(id('world-presence')).getAttribute('data-status')
  test.skip(presence === 'off', 'Presence is off: set realtime_url and realtime_secret in config.php and run the realtime test server.')
  await expect(a.locator(id('world-presence'))).toHaveAttribute('data-status', 'live')
  await expect.poll(async () => (await me(a)).scene).toBe('palazzo')   // after the fade

  // The marketplace's vendors stand at their stalls: the three officials and one vendor per guild plus the desk clerk (0.13.0).
  await expect.poll(() => a.evaluate(() => window.__guildieWorld!.officials().length)).toBe(7)

  // A second player (another browser) arrives: each sees the other, live.
  await joinAs(b, nameB, 'alchemist', { color: 4, hat: 1 })
  await goPalazzo(b)
  await expect(b.locator(id('world-presence'))).toHaveAttribute('data-status', 'live')
  await expect(peerLabel(a, nameB)).toBeVisible()
  await expect(peerLabel(b, nameA)).toBeVisible()
  const idA = await peerId(b, nameA)
  const idB = await peerId(a, nameB)
  await expect(a.locator(id('world-presence'))).toContainText(/[1-9]\d* other merchants? here/)

  // Emotes go through the room (0.10.0): B bows, A sees it.
  await b.locator('.world-canvas').focus()
  await b.keyboard.press('1')
  await expect.poll(() => a.evaluate(() => window.__guildieWorld!.lastEmote)).toEqual({ id: idB, e: 'bow' })

  // Arrivals spread out at the top of the Steps (0.10.0), so A walks up to B (tapping them opens their
  // bottega and walks over), then slaps, and B sees it.
  await walkUpTo(a, b, idA, idB)
  await a.locator('.world-canvas').focus()
  await a.keyboard.press('f')
  await expect.poll(() => b.evaluate(() => window.__guildieWorld!.lastSlap)).toEqual({ from: idA, to: idB })
  await expect(b.locator(id('world-bubble'))).toContainText('Challenge!')
  await expect.poll(() => a.evaluate(() => window.__guildieWorld!.lastSlap)).toEqual({ from: idA, to: idB })

  // B turns slaps off: A's next slap is refused by the room, and B wears the white flag.
  await b.click(id('world-slaps'))
  await expect(b.locator(id('world-slaps'))).toHaveText('Slaps: off')
  await walkUpTo(a, b, idA, idB)   // the slap knocked B back a step
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

  // The marketplace (0.13.0): a guild's vendor shows only that guild's goods; the desk sells.
  await a.click(id('dock-vendor:alchemist'))
  await expect(a.locator(id('panel-vendor:alchemist'))).toBeVisible()
  await expect(a.locator(id('browse-alchemist'))).toBeVisible()
  await expect(a.locator(id('browse-blacksmith'))).toHaveCount(0)
  await a.click(id('dock-desk'))
  await expect(a.locator(id('panel-desk'))).toBeVisible()
  await a.click(id('mode-mine'))
  await expect(a.locator(id('my-listings'))).toBeVisible()
  // The Palazzo's door: the Hall of honor and the city's merchants (the guild hall's lists until 0.13.0).
  await a.click(id('dock-hall'))
  await expect(a.locator(id('honors'))).toBeVisible()
  await expect(a.locator(id('player-me'))).toContainText(nameA)
  await a.click(id('panel-close'))

  // B leaves: A no longer sees them. Then A goes home down the Steps.
  await b.click(id('dock-home'))
  await expect(a.locator(`[data-testid="world-peer-${idB}"]`)).toHaveCount(0)
  await a.click(id('dock-home'))
  await expect(a.locator(`${id('world')}[data-scene="harbor"]`)).toBeVisible()
  await expect(a.locator(id('world-label-workbench'))).toBeVisible()

  await ctxA.close()
  await ctxB.close()
})

// Accounts from before 0.10.0 never chose a look: the 3D city invites them once; "Keep this one" saves the
// look they already had, so the invitation doesn't come back.
test('an older account is invited once to choose a look', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The invitation lives in the 3D city.')
  const name = `old${Date.now() % 1_000_000}`
  const reg = await page.request.post('api/index.php?action=register', { data: { name, password: 'testpass' } })
  const token = (await reg.json()).data.token as string
  await page.request.post('api/index.php?action=choose_profession', { data: { profession_id: 'leatherworker' }, headers: { Authorization: `Bearer ${token}` } })

  await page.goto('./?view=3d')
  await page.fill(id('login-name'), name)
  await page.fill(id('login-password'), 'testpass')
  await page.click(id('login'))
  await expect(page.locator(`${id('world')}[data-ready="yes"]`)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator(id('look-invite'))).toBeVisible()
  await page.click(id('look-keep'))
  await expect(page.locator(id('look-invite'))).toHaveCount(0)
  await page.reload()
  await expect(page.locator(`${id('world')}[data-ready="yes"]`)).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(1500)
  await expect(page.locator(id('look-invite'))).toHaveCount(0)
})

test('the Palazzo: two guilds meet live, the officials, the market, buy offers, the Factotum and your bottega', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'The 3D Palazzo is the desktop view; phones see it in City → Palazzo and the Mercato tab (play.spec.ts).')
  const stamp = Date.now() % 1_000_000
  const nameA = `pza${stamp}`, nameB = `pzb${stamp}`
  const opts = { baseURL: info.project.use.baseURL, viewport: { width: 1280, height: 860 } }
  const ctxA = await browser.newContext(opts)
  const ctxB = await browser.newContext(opts)
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()

  // Your bottega (#51): a new crafter starts in the rundown shack; the card shows the upgrade that opens Journeyman.
  await joinAs(a, nameA, 'blacksmith')
  await expect.poll(() => a.evaluate(() => window.__guildieWorld!.bottega())).toMatchObject({ level: 1, building: false })
  await a.click(id('dock-ledger'))
  await expect(a.locator(id('bottega-look'))).toHaveText('Rundown shack')
  await expect(a.locator(id('bottega-next'))).toContainText('Bellows forge')
  await expect(a.locator(id('bottega-next'))).toContainText('opens Journeyman')
  await expect(a.locator(id('bottega-build'))).toBeDisabled()
  await a.keyboard.press('Escape')

  // Up the Steps to the Palazzo: the hall, the marketplace ring, the Factotum's statue and three officials.
  await goPalazzo(a)
  await expect.poll(() => a.evaluate(() => window.__guildieWorld!.officials()))
    .toEqual(['notary', 'crier', 'steward', 'blacksmith', 'alchemist', 'leatherworker', 'traders'])   // each vendor in their guild's dress; a trader keeps the desk
  await expect(a.locator(id('world-label-desk'))).toBeVisible()
  await expect(a.locator(id('world-label-vendor:blacksmith'))).toBeVisible()
  // The richest merchant stands on the plinth in bronze (0.13.0): there is always one, since every crafter starts with ducats.
  await expect.poll(() => a.evaluate(() => window.__guildieWorld!.statue()), { timeout: 20_000 }).not.toBeNull()
  await expect(a.locator(id('world-label-statue'))).toContainText('Il Factotum')
  await expect(a.locator(id('world-label-notary'))).toContainText('Ser Benedetto')
  await a.click(id('world-label-notary'))
  await expect(a.locator(id('panel-notary'))).toBeVisible()
  await expect(a.locator(id('npc-rumor'))).not.toBeEmpty()
  await expect(a.locator(id('npc-favor'))).toBeVisible()
  await a.click(id('dock-hall'))
  await expect(a.locator(id('honors-skill'))).toBeVisible()

  await expect(a.locator(id('factotum')).locator('svg.portrait')).toBeVisible()

  // A buy offer at the selling desk (the Wanted board until 0.13.0): the ducats are held.
  await a.click(id('dock-desk'))
  await a.click(id('mode-offers'))
  await a.selectOption(id('wanted-item'), 'leather_grip')
  await a.click(id('wanted-post'))
  await message(a, 'Posted')
  await expect(a.locator('[data-testid^="wanted-mine-"]')).toHaveCount(1)
  await a.keyboard.press('Escape')

  // A tanner arrives: the Palazzo is open to every guild, so they meet live, and the tanner sees the notice.
  await joinAs(b, nameB, 'leatherworker')
  await goPalazzo(b)
  // Both are in the same room (A's camera may be zoomed in on the desk, so check the room, not the screen).
  await expect(peerLabel(b, nameA)).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => b.evaluate(() => window.__guildieWorld!.me().scene)).toBe('palazzo')   // after the arrival fade
  await expect.poll(() => a.evaluate(() => window.__guildieWorld!.peers().length), { timeout: 20_000 }).toBe(1)
  await b.click(id('dock-desk'))
  await b.click(id('mode-offers'))
  await expect(b.locator('[data-testid^="wanted-post-"]', { hasText: nameA })).toContainText('Leather Grip')

  // Back down the Steps.
  await b.keyboard.press('Escape')
  await b.click(id('dock-home'))
  await expect(b.locator(`${id('world')}[data-scene="harbor"]`)).toBeVisible()
  await ctxA.close()
  await ctxB.close()
})
