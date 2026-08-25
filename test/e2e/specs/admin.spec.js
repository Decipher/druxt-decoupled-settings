const path = require('path')
const { test, expect } = require('@playwright/test')

const DRUPAL_URL = process.env.DRUPAL_URL
const shot = (name) => path.resolve(__dirname, `../screenshots/${name}.png`)

test.use({ storageState: path.resolve(__dirname, '../reports/state.json') })
test.skip(!DRUPAL_URL || !process.env.DRUPAL_LOGIN_LINK, 'DRUPAL_URL and DRUPAL_LOGIN_LINK must be set.')

test.describe('Decoupled Settings administration', () => {
  test('the exposure form reviews what a frontend will read', async ({ page }) => {
    await page.goto(`${DRUPAL_URL}/admin/config/services/decoupled-settings`)

    await expect(page.getByRole('heading', { name: 'Decoupled Settings' })).toBeVisible()
    await expect(page.getByText('What a frontend will read')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'system.site' }).first()).toBeVisible()

    await page.screenshot({ path: shot('01-exposure-form'), fullPage: true })
  })

  test('the consumer list counts each consumer\'s overrides', async ({ page }) => {
    await page.goto(`${DRUPAL_URL}/admin/config/services/consumer`)

    await expect(page.getByRole('columnheader', { name: 'Overrides' })).toBeVisible()
    await expect(page.getByText('partner_frontend')).toBeVisible()

    await page.screenshot({ path: shot('02-consumer-list'), fullPage: true })
  })

  test('the overrides form shows inherited and overridden settings', async ({ page }) => {
    await page.goto(`${DRUPAL_URL}/admin/config/services/consumer`)
    const row = page.locator('tr', { hasText: 'partner_frontend' })
    const href = await row.locator('a[href*="decoupled-settings"]').first().getAttribute('href')
    await page.goto(`${DRUPAL_URL}${href}`)

    await expect(page.getByText('system.site:name')).toBeVisible()
    // The partner's own override is ticked with its value.
    const nameRow = page.locator('tr', { hasText: 'system.site:name' })
    await expect(nameRow.getByRole('checkbox').first()).toBeChecked()

    await page.screenshot({ path: shot('03-consumer-overrides'), fullPage: true })
  })
})
