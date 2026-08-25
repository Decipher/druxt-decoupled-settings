/* eslint-env jest */
import DruxtDecoupledSettingsModule, { applyToHead, assetProxy, collectAssets, fetchSettings, getToken } from '../src'

const attributes = {
  consumer: 'partner_frontend',
  settings: {
    'system.site': { name: 'Partner Portal', slogan: 'Same code, different consumer' },
    'olivero.settings': {
      favicon: { url: '/core/themes/olivero/favicon.ico', mimetype: 'image/vnd.microsoft.icon' },
    },
  },
}

const jsonapiResponse = () => ({ status: 200, body: JSON.stringify({ data: { attributes } }) })

describe('applyToHead', () => {
  test('builds the title from the site name and slogan', () => {
    const head = applyToHead({}, JSON.parse(JSON.stringify(attributes)))
    expect(head.title).toBe('Same code, different consumer')
    // A string template, never a function: Nuxt serializes head into the
    // build, and a function loses its closure there.
    expect(head.titleTemplate).toBe('%s | Partner Portal')
  })

  test('uses the name alone when there is no slogan', () => {
    const head = applyToHead({}, {
      consumer: null,
      settings: { 'system.site': { name: 'Solo' } },
    })
    expect(head.title).toBe('Solo')
    expect(head.titleTemplate).toBeUndefined()
  })

  test('clears a stale template when there is no slogan', () => {
    const head = applyToHead({ titleTemplate: '%s | Old Brand' }, {
      consumer: null,
      settings: { 'system.site': { name: 'Solo' } },
    })
    expect(head.title).toBe('Solo')
    expect(head.titleTemplate).toBeUndefined()
  })

  test('replaces the icon with the theme favicon, verbatim when rooted', () => {
    // After collectAssets the url is a frontend path; a rooted url is used
    // as it is, never prefixed with the backend.
    const head = applyToHead(
      { link: [{ rel: 'icon', href: '/favicon.ico' }] },
      JSON.parse(JSON.stringify(attributes)),
      'http://backend:8888'
    )
    expect(head.link).toHaveLength(1)
    expect(head.link[0]).toEqual({
      rel: 'icon',
      type: 'image/vnd.microsoft.icon',
      href: '/core/themes/olivero/favicon.ico',
    })
  })

  test('leaves non-icon links alone', () => {
    const head = applyToHead({ link: [{ rel: 'preconnect', href: 'x' }] }, JSON.parse(JSON.stringify(attributes)), '')
    expect(head.link.map((l) => l.rel).sort()).toEqual(['icon', 'preconnect'])
  })

  test('changes nothing without exposed site settings', () => {
    const head = applyToHead({ title: 'kept' }, { consumer: null, settings: {} })
    expect(head.title).toBe('kept')
  })
})

describe('fetchSettings', () => {
  test('sends the consumer header and returns the attributes', async () => {
    const doRequest = jest.fn().mockResolvedValue(jsonapiResponse())

    const result = await fetchSettings(
      { baseUrl: 'http://backend', consumerId: 'partner_frontend' },
      doRequest
    )

    expect(doRequest).toHaveBeenCalledWith('http://backend/jsonapi/decoupled/settings', {
      headers: {
        Accept: 'application/vnd.api+json',
        'X-Consumer-ID': 'partner_frontend',
      },
    })
    expect(result).toEqual(attributes)
  })

  test('authenticates with client credentials when configured', async () => {
    const doRequest = jest.fn()
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ access_token: 'tok' }) })
      .mockResolvedValueOnce(jsonapiResponse())

    await fetchSettings(
      { baseUrl: 'http://backend', clientId: 'app', clientSecret: 's3cret' },
      doRequest
    )

    const [tokenUrl, tokenRequest] = doRequest.mock.calls[0]
    expect(tokenUrl).toBe('http://backend/oauth/token')
    expect(tokenRequest.body).toContain('grant_type=client_credentials')
    expect(tokenRequest.body).toContain('scope=frontend_app')

    const [, settingsRequest] = doRequest.mock.calls[1]
    expect(settingsRequest.headers.Authorization).toBe('Bearer tok')
  })

  test('throws a pointed error on an access failure', async () => {
    const doRequest = jest.fn().mockResolvedValue({ status: 403, body: '' })

    await expect(fetchSettings({ baseUrl: 'http://backend' }, doRequest))
      .rejects.toThrow('read decoupled settings')
  })
})

describe('collectAssets', () => {
  test('rewrites named assets and lists their backend targets', () => {
    const settings = {
      'system.site': { name: 'kept alone' },
      'olivero.settings': {
        logo: { url: '/core/themes/olivero/logo.svg' },
        favicon: { url: 'http://cdn.example.com/favicon.ico' },
      },
    }

    const assets = collectAssets(settings, 'http://backend:8888')

    expect(assets).toEqual({
      logo: 'http://backend:8888/core/themes/olivero/logo.svg',
      favicon: 'http://cdn.example.com/favicon.ico',
    })
    expect(settings['olivero.settings'].logo.url).toBe('/_decoupled/logo')
    expect(settings['olivero.settings'].favicon.url).toBe('/_decoupled/favicon')
    expect(settings['system.site']).toEqual({ name: 'kept alone' })
  })

  test('gives the proxy to the first group only, like applyToHead', () => {
    const settings = {
      'olivero.settings': { favicon: { url: '/olivero.ico' } },
      'claro.settings': { favicon: { url: '/claro.ico' } },
    }
    const assets = collectAssets(settings, 'https://backend.example.com')
    expect(assets.favicon).toBe('https://backend.example.com/olivero.ico')
    expect(settings['olivero.settings'].favicon.url).toBe('/_decoupled/favicon')
    expect(settings['claro.settings'].favicon.url).toBe('https://backend.example.com/claro.ico')
  })

  test('collects nothing without theme assets', () => {
    expect(collectAssets({ 'system.site': { name: 'x' } }, 'http://b')).toEqual({})
  })
})

describe('assetProxy', () => {
  const respond = () => {
    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      setHeader(name, value) { this.headers[name] = value },
      end(chunk) { this.body += chunk || ''; this.ended = true },
    }
    return res
  }

  test('serves an allowlisted asset from the backend', async () => {
    const httpModule = require('http')
    const backend = httpModule.createServer((req, res) => {
      res.setHeader('Content-Type', 'image/svg+xml')
      res.end('<svg/>')
    })
    await new Promise((resolve) => backend.listen(0, resolve))
    const backendPort = backend.address().port

    const front = httpModule.createServer(
      assetProxy({ logo: `http://127.0.0.1:${backendPort}/logo.svg` })
    )
    await new Promise((resolve) => front.listen(0, resolve))
    const frontPort = front.address().port

    const response = await new Promise((resolve, reject) => {
      httpModule.get(`http://127.0.0.1:${frontPort}/logo`, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
      }).on('error', reject)
    })
    backend.close()
    front.close()

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('image/svg+xml')
    expect(response.headers['cache-control']).toContain('max-age')
    expect(response.body).toBe('<svg/>')
  })

  test('answers 502 when the backend accepts but never responds', async () => {
    const httpModule = require('http')
    const silent = httpModule.createServer(() => {})
    await new Promise((resolve) => silent.listen(0, resolve))
    const silentPort = silent.address().port

    const front = httpModule.createServer(
      assetProxy({ logo: `http://127.0.0.1:${silentPort}/logo.svg` }, { timeout: 100 })
    )
    await new Promise((resolve) => front.listen(0, resolve))
    const frontPort = front.address().port

    const response = await new Promise((resolve, reject) => {
      httpModule.get(`http://127.0.0.1:${frontPort}/logo`, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => resolve({ statusCode: res.statusCode, body }))
      }).on('error', reject)
    })

    expect(response.statusCode).toBe(502)
    expect(response.body).toBe('Bad gateway')

    front.close()
    silent.close()
  })

  test('refuses everything not on the allowlist', () => {
    const handler = assetProxy({ logo: 'http://backend/logo.svg' })

    for (const url of ['/favicon', '/logo/../settings.php', '/', '/anything?x=1']) {
      const res = respond()
      handler({ url }, res)
      expect(res.statusCode).toBe(404)
    }
  })
})

describe('getToken', () => {
  test('throws on a rejected grant', async () => {
    const doRequest = jest.fn().mockResolvedValue({ status: 400, body: '{}' })

    await expect(getToken({ baseUrl: 'http://b', clientId: 'a', clientSecret: 'b' }, doRequest))
      .rejects.toThrow('HTTP 400')
  })
})

describe('DruxtDecoupledSettingsModule', () => {
  test('reads druxt baseUrl and applies runtime config and head', async () => {
    // The module fetches over real HTTP, so serve the document locally.
    const httpModule = require('http')
    const server = httpModule.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/vnd.api+json')
      res.end(JSON.stringify({ data: { attributes } }))
    })
    await new Promise((resolve) => server.listen(0, resolve))
    const { port } = server.address()

    const mock = {
      addServerMiddleware: jest.fn(),
      options: {
        druxt: { baseUrl: `http://127.0.0.1:${port}` },
        head: {},
      },
    }
    await DruxtDecoupledSettingsModule.call(mock, { consumerId: 'partner_frontend' })
    server.close()

    expect(mock.options.publicRuntimeConfig.decoupledConsumer).toBe('partner_frontend')
    expect(mock.options.publicRuntimeConfig.decoupledSettings['system.site'].name).toBe('Partner Portal')
    expect(mock.options.head.title).toBe('Same code, different consumer')
    expect(mock.options.publicRuntimeConfig.decoupledBaseUrl).toContain('http://127.0.0.1:')
    // The favicon in the settings names a file, so the proxy is registered
    // and the baked URL points at the frontend, not the backend.
    expect(mock.addServerMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/_decoupled' })
    )
    expect(
      mock.options.publicRuntimeConfig.decoupledSettings['olivero.settings'].favicon.url
    ).toBe('/_decoupled/favicon')
  })
})
