// Playwright configuration for the end to end suite.
//
// The suite drives a real Drupal backend and two consumer frontends, and
// doubles as the screenshot generator for documentation: every spec saves a
// full page capture to test/e2e/screenshots/. URLs arrive through the
// environment, so the specs run against any existing stack:
//
//   DRUPAL_URL            The Drupal site. Required for the admin spec.
//   DRUPAL_LOGIN_LINK     A one-time admin login link. Required with it.
//   FRONTEND_PUBLIC_URL   The anonymous consumer's frontend.
//   FRONTEND_PARTNER_URL  The authenticated consumer's frontend.
module.exports = {
  testDir: 'test/e2e/specs',
  globalSetup: './test/e2e/global-setup.js',
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['junit', { outputFile: 'test/e2e/reports/junit.xml' }]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
  },
}
