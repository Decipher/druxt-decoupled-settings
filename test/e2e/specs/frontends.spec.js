const path = require('path')
const { test, expect } = require('@playwright/test')

const shot = (name) => path.resolve(__dirname, `../screenshots/${name}.png`)

// The frontends are anonymous surfaces: no admin session.
test.use({ storageState: { cookies: [], origins: [] } })

const cases = [
  {
    name: 'public',
    url: process.env.FRONTEND_PUBLIC_URL,
    title: 'The anonymous storefront | Druxt Public',
    brand: 'Druxt Public',
    file: '04-frontend-public',
  },
  {
    name: 'partner',
    url: process.env.FRONTEND_PARTNER_URL,
    title: 'Same code, different consumer | Partner Portal',
    brand: 'Partner Portal',
    file: '05-frontend-partner',
  },
]

for (const site of cases) {
  test.describe(`${site.name} frontend`, () => {
    test.skip(!site.url, `FRONTEND_${site.name.toUpperCase()}_URL must be set.`)

    test(`renders as ${site.brand}, branding and assets from its settings`, async ({ page }) => {
      await page.goto(site.url)

      await expect(page).toHaveTitle(site.title)
      await expect(page.locator('.site-branding__name')).toHaveText(site.brand)
      // The logo is served by the frontend's own scoped proxy.
      const logo = page.locator('.site-branding__logo')
      await expect(logo).toBeVisible()
      expect(await logo.getAttribute('src')).toBe('/_decoupled/logo')

      await page.screenshot({ path: shot(site.file), fullPage: true })
    })
  })
}
