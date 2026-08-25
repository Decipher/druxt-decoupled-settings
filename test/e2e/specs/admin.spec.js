const path = require('path')
const { test, expect } = require('@playwright/test')
const { shoot } = require('../shot')

const DRUPAL_URL = process.env.DRUPAL_URL
const shot = (name) => path.resolve(__dirname, `../screenshots/${name}.png`)

test.use({ storageState: path.resolve(__dirname, '../reports/state.json') })
test.skip(!DRUPAL_URL || !process.env.DRUPAL_LOGIN_LINK, 'DRUPAL_URL and DRUPAL_LOGIN_LINK must be set.')

test.describe('Decoupled Settings administration', () => {
  test('the exposure form reviews what a frontend will read', async ({ page }) => {
    await page.goto(`${DRUPAL_URL}/admin/config/services/decoupled-settings`)

    await expect(page.getByRole('heading', { name: 'Decoupled Settings' })).toBeVisible()
    await expect(page.getByText('What a frontend will read')).toBeVisible()

    // The filter narrows the review to one object - it keeps the capture
    // compact and shows the filter working, both at once.
    await page.getByPlaceholder('Filter by setting name or value').last().fill('system.site')
    await expect(page.getByRole('cell', { name: 'system.site', exact: true }).first()).toBeVisible()

    await shoot(page, 'form.decoupled-settings-settings, #decoupled-settings-settings, main form', shot('01-exposure-form'))
  })

  test('the consumer list counts each consumer\'s overrides', async ({ page }) => {
    await page.goto(`${DRUPAL_URL}/admin/config/services/consumer`)

    await expect(page.getByRole('columnheader', { name: 'Overrides' })).toBeVisible()
    await expect(page.getByText('partner_frontend')).toBeVisible()
    // The quickstart's own OAuth login consumer is plumbing, not the story.
    await expect(page.getByRole('cell', { name: 'Druxt', exact: true })).toHaveCount(0)

    await shoot(page, 'main table', shot('02-consumer-list'))
  })

  test('the overrides form shows inherited and overridden settings', async ({ page }) => {
    await page.goto(`${DRUPAL_URL}/admin/config/services/consumer`)
    const row = page.locator('tr', { hasText: 'partner_frontend' })
    const href = await row.locator('a[href*="decoupled-settings"]').first().getAttribute('href')
    await page.goto(`${DRUPAL_URL}${href}`)

    await expect(page.getByRole('cell', { name: 'system.site:name', exact: true })).toBeVisible()
    // The partner's own override is ticked.
    await expect(page.getByRole('checkbox', { name: 'Override system.site:name' })).toBeChecked()

    await page.getByPlaceholder('Filter by setting name or value').fill('system.site')

    await shoot(page, 'main form', shot('03-consumer-overrides'))
  })
})
