// Plays through the whole game in a real browser, against a real API (replaces the Godot client_smoke.gd).
// Each run registers a fresh player, picks the Alchemist guild, and touches every screen.
import { expect, test, type Page } from '@playwright/test'

const id = (s: string) => `[data-testid="${s}"]`

async function message(page: Page, text: RegExp | string) {
  await expect(page.locator(id('message'))).toContainText(text)
}

test('a new alchemist plays through every screen', async ({ page }, info) => {
  const name = `pw_${info.project.name.slice(0, 2)}${Date.now() % 1_000_000}`

  // --- login screen -> register
  await page.goto('./')
  await expect(page.locator('h1')).toHaveText('Guildie')
  // The footer shows the server's build once the ping answers ("dev" on CI's unpackaged server).
  await expect(page.getByText(/· Server (?!…|unreachable)\S/)).toBeVisible()
  await page.fill(id('login-name'), name)
  await page.fill(id('login-password'), 'testpass')
  await page.click(id('register'))

  // --- choose a guild
  await expect(page.locator(id('guild-alchemist'))).toBeVisible()
  await page.click(id('join-alchemist'))
  await expect(page.locator(id('who'))).toContainText(`${name} · Alchemist`)
  await expect(page.locator(id('gold'))).toHaveText(/^[\d,]+ ducats?$/)
  await expect(page.locator('.tabbar button')).toHaveCount(4)

  // --- workshop: collect, then craft from the recipes on the same screen (#39)
  await page.click(id('collect-station'))
  await expect(page.locator(id('message'))).toBeVisible()   // "Collected." or a surprise (#48)

  // --- the order board (#44): three customers, or a customer on the way
  await expect(page.locator(id('orders'))).toBeVisible()
  await expect(page.locator(`${id('order')}, ${id('order-arriving')}`)).toHaveCount(3)
  await page.locator(id('order-skip')).first().click()
  await message(page, /turned down/)
  await expect(page.locator(id('order-skip')).first()).toBeDisabled()   // skip cooldown
  const draught = page.locator(id('recipe-healing_draught'))
  await expect(draught).toBeVisible()
  await draught.getByRole('button', { name: 'plus 1' }).click()
  await page.click(id('craft-healing_draught'))
  await message(page, /Started 2 × Healing Draught/)
  await expect(page.locator(id('crafts'))).toContainText('Ready!', { timeout: 60_000 })
  await expect(page.locator(id('collect-crafts'))).toBeEnabled()
  await page.click(id('collect-crafts'))
  await expect(page.locator(id('message'))).toBeVisible()
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
})
