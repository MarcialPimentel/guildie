// Plays through the whole game in a real browser, against a real API (replaces the Godot client_smoke.gd).
// Each run registers a fresh player, picks the Alchemist guild, and touches every screen.
import { expect, test, type Page } from '@playwright/test'
// The guilds this build has (Node's test runner needs the JSON import attribute).
import content from '../../content/professions.json' with { type: 'json' }

const id = (s: string) => `[data-testid="${s}"]`

async function message(page: Page, text: RegExp | string) {
  await expect(page.locator(id('message'))).toContainText(text)
}

test('a new alchemist plays through every screen', async ({ page }, info) => {
  const name = `pw_${info.project.name.slice(0, 2)}${Date.now() % 1_000_000}`
  const engineRequests: string[] = []
  page.on('request', (r) => { if (/\/engine-[^/]*\.js/.test(r.url())) engineRequests.push(r.url()) })

  // --- login screen -> register. Desktop defaults to the 3D harbor (world.spec.ts), so this test asks for the
  // classic screens there; phones get the classic view by default.
  await page.goto(info.project.name === 'desktop' ? './?view=classic' : './')
  await expect(page.locator('h1')).toHaveText('Guildie')
  // The footer shows the server's build once the ping answers ("dev" on CI's unpackaged server).
  await expect(page.getByText(/· Server (?!…|unreachable)\S/)).toBeVisible()
  await page.fill(id('login-name'), name)
  await page.fill(id('login-password'), 'testpass')
  await page.click(id('register'))

  // --- choose a guild, and how your merchant looks (0.10.0: a body color, and a hat on the guild's card)
  await expect(page.locator(id('guild-alchemist'))).toBeVisible()
  await page.click(id('look-color-4'))
  await expect(page.locator(id('look-color-4'))).toHaveAttribute('aria-checked', 'true')
  await page.click(id('hat-alchemist-2'))
  await expect(page.locator(id('hat-alchemist-2'))).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator(`${id('guild-alchemist')} svg.portrait`)).toHaveAttribute('aria-label', /Hood, Lavender/)
  await page.click(id('join-alchemist'))
  await expect(page.locator(id('who'))).toContainText(name)
  await expect(page.locator(id('skill'))).toHaveText('Alchemist 1/100 · Apprentice')   // skill and rank (#30)
  await expect(page.locator(id('xp-bar'))).toBeVisible()
  await expect(page.locator(id('gold'))).toHaveText(/^[\d,]+ ducats?$/)
  await expect(page.locator('.tabbar button')).toHaveCount(4)
  await expect(page.locator(id('world'))).toHaveCount(0)   // no 3D on the classic view (phones: never downloaded)

  // --- workshop: collect, then craft from the recipes on the same screen (#39)
  await page.click(id('collect-station'))
  await expect(page.locator(id('message'))).toBeVisible()   // "Collected." or a surprise (#48)

  // --- the order board (#44): three customers, or a customer on the way
  await expect(page.locator(id('orders'))).toBeVisible()
  await expect(page.locator(`${id('order')}, ${id('order-arriving')}`)).toHaveCount(3)
  await expect(page.locator(id('order-xp')).first()).toContainText(/\d+ XP/)   // orders pay XP (#30)
  await page.locator(id('order-skip')).first().click()
  await message(page, /turned down/)
  await expect(page.locator(id('order-skip')).first()).toBeDisabled()   // skip cooldown
  const draught = page.locator(id('recipe-healing_draught'))
  await expect(draught).toBeVisible()
  await expect(page.locator(`${id('recipes')} [data-testid^="recipe-"]`)).toHaveCount(1)   // only the free starter is known (#49)
  await expect(draught.locator(id('xp-chip'))).toHaveText('+10 XP')
  await expect(page.locator(id('double-xp'))).toBeVisible()
  await draught.getByRole('button', { name: 'plus 1' }).click()
  await page.click(id('craft-healing_draught'))
  await message(page, /Started 2 × Healing Draught/)
  await expect(page.locator(id('crafts'))).toContainText('Ready!', { timeout: 60_000 })
  await expect(page.locator(id('collect-crafts'))).toBeEnabled()
  await page.click(id('collect-crafts'))
  // 2 crafts x 10 XP, doubled for the first craft of the day; the first Healing Draught adds a skill point: 1 -> 3.
  await message(page, /\+40 XP \(first craft today: double\) · skill 1 → 3/)
  await expect(page.locator(id('skill'))).toHaveText('Alchemist 3/100 · Apprentice')
  await expect(page.locator(id('double-xp'))).toHaveCount(0)

  // --- the guild trainer (#49): in the recipes column; what each recipe needs, costs and gives
  await page.click(id('trainer-open'))
  await expect(page.locator(id('lesson-smelting_flux'))).toContainText('Learn from skill 15')
  await expect(page.locator(id('lesson-steam_tonic'))).toContainText('Uses Blacksmith goods')
  await expect(page.locator(id('lesson-cliffside_draught'))).toContainText('Only a customer can teach this')
  await expect(page.locator(id('lesson-healing_draught')).locator(id('known'))).toBeVisible()
  await expect(page.locator('[data-testid^="learn-"]')).toHaveCount(0)   // nothing learnable at skill 3
  await page.click(id('trainer-close'))
  await expect(draught).toBeVisible()
  await expect(page.locator(id('footer'))).toContainText(/Client .+ · Server (?!\?)\S/)

  // --- bag -> sell form: the Exchange comes first, the guild sale below (#37)
  await page.click(id('tab-bag'))
  await expect(page.locator(id('bag-healing_draught'))).toContainText('× 2')
  await page.locator(id('bag-healing_draught')).getByRole('button', { name: 'Sell' }).click()
  await expect(page.locator(id('sell-form'))).toBeVisible()
  await expect(page.locator(`${id('list-on-exchange')} ~ ${id('guild-sale')}`)).toHaveCount(1)
  await expect(page.locator(id('raw-hint'))).toHaveCount(0)
  await page.getByRole('button', { name: 'minus 1' }).first().click()   // sell 1 of 2 to the guild
  await expect(page.locator(id('sell-to-guild'))).toContainText('Sell 1 to the guild')
  await page.click(id('sell-to-guild'))
  await message(page, /Sold 1 Healing Draught to the guild/)

  // --- list the other one on the Exchange
  await page.click(id('sell-healing_draught'))
  await expect(page.locator(id('list-item'))).toBeVisible()
  await page.click(id('list-item'))
  await message(page, /Listed 1 Healing Draught/)
  await expect(page.locator(id('my-listings'))).toContainText('Healing Draught')

  // --- raw materials explain they have no city buyers
  await page.click(id('mode-sell'))
  await page.click(id('sell-sunleaf'))
  await expect(page.locator(id('raw-hint'))).toBeVisible()

  // --- browse: the news board (#46) and the ticker (#45), then an item's detail with its history
  await page.click(id('mode-browse'))
  await expect(page.locator(id('news'))).toContainText('City news')
  await expect(page.locator(id('trend')).first()).toContainText(/%/)
  await page.click(id('browse-item-brass_fittings'))
  await expect(page.locator(id('item-detail'))).toContainText('Brass Fittings')
  await expect(page.locator(id('item-detail'))).toContainText('usual')

  // --- city: one list with Gold and Crafts columns (#38), a profile, the trade form, the inbox (#32)
  await page.click(id('tab-city'))
  await expect(page.locator(id('players'))).toBeVisible()
  await expect(page.locator(id('player-me'))).toContainText(name)
  await page.click(id('sort-crafts'))
  await expect(page.locator(id('players'))).toContainText('by crafts made')
  await expect(page.locator(id('title'))).toHaveCount(1)
  const others = page.locator(id('player'))
  if ((await others.count()) > 0) {
    await others.first().click()
    await expect(page.locator(id('profile'))).toBeVisible()
    await page.click(id('propose-trade'))
    await expect(page.locator(id('compose'))).toBeVisible()
    await expect(page.locator(id('send-offer'))).toBeVisible()
  }
  await page.click(id('mode-trades'))
  await expect(page.locator(id('trades'))).toContainText('Offers to you')

  // --- the living city as lists (0.9.0): your guild's quarter (your own stall is there), friends, the Duke's order
  await page.click(id('mode-quarters'))
  await expect(page.locator(id('quarters'))).toContainText('Alchemists')
  await expect(page.locator(id('stall-me'))).toContainText(name)
  await page.click(id('mode-friends'))
  await expect(page.locator(id('friends'))).toContainText('No friends yet')
  await page.click(id('mode-duke'))
  await expect(page.locator(id('duke'))).toBeVisible()
  await expect(page.locator(id('duke-status'))).toBeVisible()
  await expect(page.locator('[data-testid^="duke-line-"]').first()).toBeVisible()

  // --- feedback (#29)
  await page.click(id('feedback-open'))
  await page.fill(id('feedback-text'), `Browser test feedback (${info.project.name})`)
  await page.click(id('feedback-send'))
  await expect(page.locator(id('feedback-dialog'))).toHaveCount(0)
  await message(page, 'Thanks! Feedback sent.')

  // --- "While you were away" (#47): pretend the last visit was an hour ago, then reload.
  // Leaving the page marks the player as just seen, so the old time is planted as the page loads (once).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('pw-away')) return
    sessionStorage.setItem('pw-away', '1')
    for (const k of Object.keys(localStorage)) if (k.startsWith('guildie.lastSeen.')) localStorage.setItem(k, String(Math.floor(Date.now() / 1000) - 3600))
  })
  await page.reload()
  await expect(page.locator(id('return-summary'))).toContainText('While you were away')
  await page.click(id('return-close'))
  await expect(page.locator(id('return-summary'))).toHaveCount(0)

  // --- log out
  await page.click(id('tab-workshop'))
  await page.click(id('logout'))
  await expect(page.locator(id('login'))).toBeVisible()

  // The classic view never downloads the 3D harbor (it's a separate file, loaded only by the 3D view).
  expect(engineRequests).toEqual([])
})

// Guilds are content (0.10.3): every guild in content/professions.json shows on the chooser with its portrait,
// and every hat it names draws on that portrait. A guild added without its art kit fails here (and in the
// content validator) instead of crashing the chooser for new players.
test('every guild in content has a card, a portrait and all its hats', async ({ page }, info) => {
  const guilds = content.professions
  await page.goto(info.project.name === 'desktop' ? './?view=classic' : './')
  await page.fill(id('login-name'), `pw_g${info.project.name.slice(0, 1)}${Date.now() % 1_000_000}`)
  await page.fill(id('login-password'), 'testpass')
  await page.click(id('register'))
  for (const g of guilds) {
    const card = page.locator(id(`guild-${g.id}`))
    await expect(card).toBeVisible()
    for (const [i, hat] of g.guild.hats.entries()) {
      await page.click(id(`hat-${g.id}-${i}`))
      await expect.poll(() => card.locator('svg.portrait').getAttribute('aria-label')).toContain(`${hat}, `)
      await expect(card.locator(`svg.portrait ${id('portrait-hat')}`)).toHaveCount(1)
    }
  }
})
