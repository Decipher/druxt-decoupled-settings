import http from 'http'
import https from 'https'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Minimal HTTP client. Node 16, the version Nuxt 2 projects run on, has no
 * global fetch.
 */
export const request = (url, { method = 'GET', headers = {}, body = null } = {}) =>
  new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    let req
    try {
      req = lib.request(url, { method, headers }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      })
    }
    catch (error) {
      // A malformed baseUrl throws here rather than emitting. Without the
      // prefix a build dies on a bare "Invalid URL" that names no module.
      reject(new Error(`[decoupled-settings] cannot request ${url}: ${error.message}`))
      return
    }
    // Same reason: an unreachable backend is the first thing anyone hits, and
    // "connect ECONNREFUSED" alone does not say which module wanted it.
    req.on('error', (error) => reject(
      new Error(`[decoupled-settings] request to ${url} failed: ${error.message}`)
    ))
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
  const attributes = JSON.parse(response.body).data.attributes

  // Drupal answers 200 with the global values for a consumer it cannot find,
  // and an OAuth token names its own consumer whatever the header says. Both
  // are silent, and both build the wrong site.
  if (options.consumerId && attributes.consumer !== options.consumerId) {
    // eslint-disable-next-line no-console
    console.warn(
      `[decoupled-settings] asked for consumer "${options.consumerId}" and got ` +
        `"${attributes.consumer || 'none, the global values'}". ` +
        'Check the client_id, or the credentials if this build authenticates.'
    )
  }

  return attributes
}

/**
 * Builds a server middleware that proxies only the allowlisted assets.
 *
 * The allowlist is built from the fetched settings, so the frontend serves
 * the consumer's logo and favicon from its own origin and the backend needs
 * no public exposure. Anything not in the list is a 404: this is a proxy to
 * named files, never to the backend.
 */
export const assetProxy = (assets, { timeout = 10000 } = {}) => (req, res) => {
  const key = (req.url || '').replace(/^\/+/, '').replace(/[?#].*$/, '')
  // Own properties only. A plain object answers to "constructor" and
  // "__proto__" with something truthy that is not a string, which reached
  // startsWith() below and threw a 500 on an unauthenticated path.
  const target = Object.prototype.hasOwnProperty.call(assets, key) ? assets[key] : undefined
  if (!target) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  const lib = target.startsWith('https:') ? https : http
  const upstreamRequest = lib
    // No keep-alive agent: a pooled socket would hold the process open.
    .get(target, { agent: false, timeout }, (upstream) => {
      res.statusCode = upstream.statusCode
      if (upstream.headers['content-type']) {
        res.setHeader('Content-Type', upstream.headers['content-type'])
      }
      res.setHeader('Cache-Control', 'public, max-age=3600')
      // pipe() does not forward an error on the source. Without these the
      // downstream response stays open forever when the backend dies part
      // way through a body it already promised.
      upstream.on('error', () => res.destroy())
      upstream.on('aborted', () => res.destroy())
      upstream.pipe(res)
    })
    .on('error', () => {
      if (res.headersSent) {
        res.destroy()
        return
      }
      res.statusCode = 502
      res.end('Bad gateway')
    })
  // Node only emits the event. The request must be destroyed by hand, or a
  // silent upstream would hold the response open forever.
  upstreamRequest.on('timeout', () => upstreamRequest.destroy(new Error('upstream timeout')))
}

/**
 * Rewrites the theme asset URLs to frontend paths and lists the targets.
 *
 * Mutates the settings so every consumer of the runtime config gets a URL
 * that works from the browser, and returns the name-to-backend-URL map the
 * proxy serves.
 */
export const collectAssets = (settings, baseUrl) => {
  const assets = Object.create(null)
  const claimed = new Set()
  for (const [group, values] of Object.entries(settings)) {
    if (group === 'system.site' || !carriesThemeAssets(values)) continue
    for (const name of ['logo', 'favicon']) {
      const item = values[name]
      if (!item || !item.url) continue
      const absolute = item.url.startsWith('http') ? item.url : `${baseUrl}${item.url}`
      // The proxy serves one theme: the first group carrying assets, which is
      // the same group applyToHead reads. A later group keeps a direct
      // backend URL, so its data stays truthful.
      if (claimed.has(name)) {
        item.url = absolute
        continue
      }
      claimed.add(name)
      // Keep the source extension. A static build serves these as files, and
      // a host reads the content type off the name: an <img> pointed at an
      // extensionless SVG does not render.
      const key = `${name}${assetExtension(absolute)}`
      assets[key] = absolute
      item.url = `/_decoupled/${key}`
    }
  }
  return assets
}

/**
 * Reads the file extension off an asset URL, query string and all removed.
 */
export const assetExtension = (url) => {
  const clean = url.split(/[?#]/)[0]
  const match = /\.[a-z0-9]+$/i.exec(clean)

  return match ? match[0].toLowerCase() : ''
}

/**
 * Tests whether a settings group holds the theme's assets.
 *
 * Named for what it carries, not for what it is called. The backend appends
 * theme settings after every administrator-chosen object, so any other
 * exposed object whose name ends in ".settings", such as user.settings, won
 * a name match and took the favicon with it.
 */
export const carriesThemeAssets = (values) =>
  Boolean(values && ((values.logo && values.logo.url) || (values.favicon && values.favicon.url)))

/**
 * Finds the settings group holding the theme's assets.
 */
export const findThemeSettings = (settings) => {
  const found = Object.entries(settings)
    .find(([group, values]) => group !== 'system.site' && carriesThemeAssets(values))

  return found ? found[1] : {}
}

/**
 * Downloads one asset as bytes.
 *
 * The request helper above accumulates a string, which is right for JSON and
 * wrong for an .ico. This keeps the chunks as buffers.
 */
export const download = (url, { timeout = 10000 } = {}) =>
  new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    const req = lib.get(url, { agent: false, timeout }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`[decoupled-settings] asset fetch failed: HTTP ${res.statusCode} for ${url}`))
        return
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', (error) => reject(
      new Error(`[decoupled-settings] asset fetch failed for ${url}: ${error.message}`)
    ))
    req.on('timeout', () => req.destroy(new Error('upstream timeout')))
  })

/**
 * Writes the proxied assets into a generated site.
 *
 * A static build has no server middleware, so the paths the settings were
 * rewritten to would 404 and the logo and favicon would break with a green
 * build and no warning. Writing the files at those paths keeps one set of
 * URLs true for both targets.
 */
export const writeAssets = async (assets, distPath, deps = {}) => {
  const write = deps.writeFile || fs.writeFile
  const makeDir = deps.mkdir || fs.mkdir
  const fetchAsset = deps.download || download

  const dir = path.join(distPath, '_decoupled')
  await makeDir(dir, { recursive: true })
  for (const [name, target] of Object.entries(assets)) {
    await write(path.join(dir, name), await fetchAsset(target))
  }

  return Object.keys(assets)
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
  const themeSettings = findThemeSettings(attributes.settings)

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
      // A leftover template would keep branding every page with old text.
      delete head.titleTemplate
    }
  }
  if (themeSettings.favicon && themeSettings.favicon.url) {
    const { url } = themeSettings.favicon
    const href = url.startsWith('/') || url.startsWith('http') ? url : `${baseUrl}${url}`
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

  // Serve the consumer's own assets from the frontend origin. The proxy
  // only knows the files the settings name.
  const assets = collectAssets(attributes.settings, options.baseUrl)
  if (Object.keys(assets).length) {
    this.addServerMiddleware({ path: '/_decoupled', handler: assetProxy(assets) })
    // nuxt generate throws the server away, so the same files have to exist
    // on disk under the same paths.
    if (this.nuxt && typeof this.nuxt.hook === 'function') {
      this.nuxt.hook('generate:done', async (generator) => {
        // Generator.distPath is options.generate.dir, set in its constructor.
        // Read the option as a fallback rather than trusting one property.
        const distPath = generator.distPath || generator.nuxt.options.generate.dir
        const written = await writeAssets(assets, distPath)
        // eslint-disable-next-line no-console
        console.info(`[decoupled-settings] wrote static assets: ${written.join(', ')}`)
      })
    }
  }

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
