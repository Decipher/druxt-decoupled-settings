const { chromium } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

/**
 * Logs in once with the one time admin link and saves the session.
 *
 * The login link can only be used once, so the admin spec shares this
 * storage state instead of logging in itself. Skipped when no backend is
 * configured, so the frontend spec still runs alone.
 */
module.exports = async () => {
  const dir = path.resolve(__dirname, 'reports')
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.resolve(__dirname, 'screenshots'), { recursive: true })

  const state = path.join(dir, 'state.json')
  const link = process.env.DRUPAL_LOGIN_LINK
  if (!link) {
    fs.writeFileSync(state, JSON.stringify({ cookies: [], origins: [] }))
    return
  }
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(link)
  await page.context().storageState({ path: state })
  await browser.close()
}
