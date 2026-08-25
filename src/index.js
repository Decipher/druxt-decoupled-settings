import http from 'http'
import https from 'https'

/**
 * Minimal HTTP client. Node 16, the version Nuxt 2 projects run on, has no
 * global fetch.
 */
export const request = (url, { method = 'GET', headers = {}, body = null } = {}) =>
  new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    const req = lib.request(url, { method, headers }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })

/**
 * Gets an OAuth2 access token with the client_credentials grant.
 *
 * This is the app authenticating, not a user: druxt-auth covers the user
 * login flow, and nothing covered the build-time flow before this module.
 */
export const getToken = async (options, doRequest = request) => {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: options.clientId,
    client_secret: options.clientSecret,
    // Simple OAuth 6 resolves no default scope for client_credentials, so
    // the scope must be named.
    scope: options.scope || 'frontend_app',
  })
  const response = await doRequest(`${options.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (response.status !== 200) {
    throw new Error(`[decoupled-settings] OAuth token request failed: HTTP ${response.status}`)
  }
  return JSON.parse(response.body).access_token
}

/**
 * Fetches the resolved settings for the configured consumer.
 */
export const fetchSettings = async (options, doRequest = request) => {
  const headers = { Accept: 'application/vnd.api+json' }
  if (options.consumerId) {
    headers['X-Consumer-ID'] = options.consumerId
  }
  if (options.clientId && options.clientSecret) {
    headers.Authorization = `Bearer ${await getToken(options, doRequest)}`
  }

  const response = await doRequest(`${options.baseUrl}/jsonapi/decoupled/settings`, { headers })
  if (response.status !== 200) {
    throw new Error(
      `[decoupled-settings] settings fetch failed: HTTP ${response.status}. ` +
        'Check the "read decoupled settings" permission and the consumer credentials.'
    )
  }
  return JSON.parse(response.body).data.attributes
}

/**
 * Applies the consumer's settings to a Nuxt head object.
 *
 * The site name and slogan become the document title, and the active
 * theme's resolved favicon replaces any static icon. Pure function, so the
 * behaviour is testable without a build.
 */
export const applyToHead = (head = {}, attributes, baseUrl = '') => {
  const site = attributes.settings['system.site'] || {}
  const theme = Object.entries(attributes.settings)
    .find(([group]) => group !== 'system.site' && group.endsWith('.settings'))
  const themeSettings = theme ? theme[1] : {}

  if (site.name) {
    // Druxt router sets a per-page title from Drupal; the template brands
    // every one with this consumer's site name. A closure would not
    // survive here: Nuxt serializes head into the build and a function
    // loses its scope, so only string templates are safe.
    if (site.slogan) {
      head.title = site.slogan
      head.titleTemplate = `%s | ${site.name}`
    }
    else {
      head.title = site.name
    }
  }
  if (themeSettings.favicon && themeSettings.favicon.url) {
    const href = themeSettings.favicon.url.startsWith('http')
      ? themeSettings.favicon.url
      : `${baseUrl}${themeSettings.favicon.url}`
    head.link = (head.link || [])
      .filter((link) => link.rel !== 'icon')
      .concat([{ rel: 'icon', type: themeSettings.favicon.mimetype || 'image/x-icon', href }])
  }
  return head
}

/**
 * The Nuxt module.
 *
 * Runs at build time: identifies the app as a Drupal consumer, fetches the
 * resolved settings, bakes them into publicRuntimeConfig, and applies them
 * to the document head. Every option falls back to the environment, and the
 * base URL falls back to the druxt module's.
 */
const DruxtDecoupledSettingsModule = async function (moduleOptions = {}) {
  const options = {
    baseUrl: (this.options.druxt || {}).baseUrl || process.env.BASE_URL,
    consumerId: process.env.DRUXT_CONSUMER_ID,
    clientId: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    scope: process.env.OAUTH_SCOPE,
    applyHead: true,
    ...(this.options.decoupledSettings || {}),
    ...moduleOptions,
  }

  const attributes = await fetchSettings(options)

  this.options.publicRuntimeConfig = this.options.publicRuntimeConfig || {}
  this.options.publicRuntimeConfig.decoupledSettings = attributes.settings
  this.options.publicRuntimeConfig.decoupledConsumer = attributes.consumer
  // Components need the backend origin to resolve relative asset paths,
  // such as the theme logo, from the settings.
  this.options.publicRuntimeConfig.decoupledBaseUrl = options.baseUrl

  if (options.applyHead) {
    this.options.head = applyToHead(this.options.head, attributes, options.baseUrl)
  }

  // eslint-disable-next-line no-console
  console.info(
    `[decoupled-settings] loaded for consumer=${attributes.consumer || '(none)'}:`,
    Object.keys(attributes.settings).join(', ')
  )
}

export default DruxtDecoupledSettingsModule
