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
