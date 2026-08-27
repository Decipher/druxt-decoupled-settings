import DruxtDecoupledSettingsModule, { applyToHead, assetExtension, assetProxy, carriesThemeAssets, collectAssets, download, fetchSettings, findThemeSettings, getToken, request, writeAssets } from '../src'

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

  test('fetches anonymously when no consumer or credentials are given', async () => {
    const doRequest = jest.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ data: { attributes: { consumer: null, settings: {} } } }),
    })

    const attributes = await fetchSettings({ baseUrl: 'http://b' }, doRequest)

    const [, sent] = doRequest.mock.calls[0]
    expect(sent.headers['X-Consumer-ID']).toBeUndefined()
    expect(sent.headers.Authorization).toBeUndefined()
    expect(sent.headers.Accept).toBe('application/vnd.api+json')
    expect(attributes.consumer).toBeNull()
  })

  test('warns when the consumer that answered is not the one asked for', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const doRequest = jest.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ data: { attributes: { consumer: null, settings: {} } } }),
    })

    await fetchSettings({ baseUrl: 'http://b', consumerId: 'typo_frontend' }, doRequest)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('typo_frontend'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('none, the global values'))
    warn.mockRestore()
  })

  test('warns when a token resolves a different consumer than the header asked for', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const doRequest = jest.fn()
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ access_token: 't' }) })
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ data: { attributes: { consumer: 'partner_frontend', settings: {} } } }),
      })

    await fetchSettings({
      baseUrl: 'http://b',
      consumerId: 'public_frontend',
      clientId: 'partner_frontend',
      clientSecret: 'secret',
    }, doRequest)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"partner_frontend"'))
    warn.mockRestore()
  })

  test('says nothing when the consumer matches', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const doRequest = jest.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ data: { attributes } }),
    })

    await fetchSettings({ baseUrl: 'http://b', consumerId: 'partner_frontend' }, doRequest)

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  test('throws a pointed error on an access failure', async () => {
    const doRequest = jest.fn().mockResolvedValue({ status: 403, body: '' })

    await expect(fetchSettings({ baseUrl: 'http://backend' }, doRequest))
      .rejects.toThrow('read decoupled settings')
  })
})

describe('request', () => {
  test('resolves the status and body of a plain GET', async () => {
    const httpModule = require('http')
    const server = httpModule.createServer((req, res) => {
      res.statusCode = 201
      res.end('pong')
    })
    await new Promise((resolve) => server.listen(0, resolve))

    const response = await request(`http://127.0.0.1:${server.address().port}/ping`)

    expect(response).toEqual({ status: 201, body: 'pong' })
    server.close()
  })

  test('names the module when the URL is malformed', async () => {
    await expect(request('not a url')).rejects.toThrow('[decoupled-settings] cannot request not a url')
  })

  test('names the module when the host cannot be reached', async () => {
    // Port 1 on loopback: nothing listens, so the socket errors at once.
    await expect(request('http://127.0.0.1:1/nowhere'))
      .rejects.toThrow('[decoupled-settings] request to http://127.0.0.1:1/nowhere failed')
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

    expect({ ...assets }).toEqual({
      'logo.svg': 'http://backend:8888/core/themes/olivero/logo.svg',
      'favicon.ico': 'http://cdn.example.com/favicon.ico',
    })
    expect(settings['olivero.settings'].logo.url).toBe('/_decoupled/logo.svg')
    expect(settings['olivero.settings'].favicon.url).toBe('/_decoupled/favicon.ico')
    expect(settings['system.site']).toEqual({ name: 'kept alone' })
  })

  test('gives the proxy to the first group only, like applyToHead', () => {
    const settings = {
      'olivero.settings': { favicon: { url: '/olivero.ico' } },
      'claro.settings': { favicon: { url: '/claro.ico' } },
    }
    const assets = collectAssets(settings, 'https://backend.example.com')
    expect(assets['favicon.ico']).toBe('https://backend.example.com/olivero.ico')
    expect(settings['olivero.settings'].favicon.url).toBe('/_decoupled/favicon.ico')
    expect(settings['claro.settings'].favicon.url).toBe('https://backend.example.com/claro.ico')
  })

  test('leaves an already absolute asset URL alone', () => {
    const settings = {
      'olivero.settings': { logo: { url: 'https://cdn.example.com/logo.svg' } },
    }
    const assets = collectAssets(settings, 'https://backend.example.com')

    expect(assets['logo.svg']).toBe('https://cdn.example.com/logo.svg')
    expect(settings['olivero.settings'].logo.url).toBe('/_decoupled/logo.svg')
  })

  test('collects nothing without theme assets', () => {
    expect({ ...collectAssets({ 'system.site': { name: 'x' } }, 'http://b') }).toEqual({})
  })
})

describe('theme detection', () => {
  // An exposed object whose name ends in ".settings" won a name match and
  // took the favicon with it, because the backend appends theme settings
  // after every administrator-chosen object.
  test('finds the theme by the assets it carries, not by its name', () => {
    const settings = {
      'system.site': { name: 'Site' },
      'user.settings': { register: 'admin_only' },
      'olivero.settings': { favicon: { url: '/olivero.ico' }, logo: { url: '/olivero.svg' } },
    }

    const assets = collectAssets(settings, 'http://backend')

    expect(assets['favicon.ico']).toBe('http://backend/olivero.ico')
    expect(settings['user.settings'].register).toBe('admin_only')
    expect(findThemeSettings(settings).favicon.url).toBe('/_decoupled/favicon.ico')
  })

  test('is true only for a group holding a resolved asset URL', () => {
    expect(carriesThemeAssets({ logo: { url: '/logo.svg' } })).toBe(true)
    expect(carriesThemeAssets({ favicon: { url: '/favicon.ico' } })).toBe(true)
    // A theme with the feature switched off has the key and no URL.
    expect(carriesThemeAssets({ logo: { path: '', use_default: true } })).toBe(false)
    expect(carriesThemeAssets({ register: 'admin_only' })).toBe(false)
    expect(carriesThemeAssets(undefined)).toBe(false)
  })

  test('never mistakes system.site for the theme, and copes with neither', () => {
    expect(findThemeSettings({ 'system.site': { logo: { url: '/site.svg' } } })).toEqual({})
    expect(findThemeSettings({ 'system.site': { name: 'x' } })).toEqual({})
  })

  test('reads the extension, query string and fragment removed', () => {
    expect(assetExtension('http://b/logo.SVG?itok=abc')).toBe('.svg')
    expect(assetExtension('http://b/favicon.ico#x')).toBe('.ico')
    expect(assetExtension('http://b/brand')).toBe('')
  })

  test('names an extensionless asset without one', () => {
    const settings = { 'olivero.settings': { logo: { url: '/styles/brand' } } }
    const assets = collectAssets(settings, 'http://backend')

    expect(assets.logo).toBe('http://backend/styles/brand')
    expect(settings['olivero.settings'].logo.url).toBe('/_decoupled/logo')
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

  test('never leaves the client hanging when the backend dies mid-body', async () => {
    const httpModule = require('http')
    // Promises 100 bytes, sends four, then drops the socket.
    const flaky = httpModule.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Content-Length': '100' })
      res.write('<svg')
      res.socket.destroy()
    })
    await new Promise((resolve) => flaky.listen(0, resolve))
    const flakyPort = flaky.address().port

    const front = httpModule.createServer(
      assetProxy({ logo: `http://127.0.0.1:${flakyPort}/logo.svg` })
    )
    await new Promise((resolve) => front.listen(0, resolve))
    const frontPort = front.address().port

    // Whether the proxy has flushed its own headers by the time the backend
    // dies is a race, so both endings are correct: a gateway error, or a
    // truncated body. What must never happen is neither, which is what a
    // pipe with no error forwarding does.
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ hung: true }), 3000)
      const settle = (value) => { clearTimeout(timer); resolve(value) }
      httpModule.get(`http://127.0.0.1:${frontPort}/logo`, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => settle({ statusCode: res.statusCode, body }))
        res.on('error', () => settle({ statusCode: res.statusCode, body, aborted: true }))
      }).on('error', reject)
    })

    expect(result.hung).toBeUndefined()
    if (result.statusCode === 502) {
      expect(result.body).toBe('Bad gateway')
    }
    else {
      expect(result.statusCode).toBe(200)
      expect(result.body.length).toBeLessThan(100)
    }

    front.close()
    flaky.close()
  })

  test('passes an asset through without a content type', async () => {
    const httpModule = require('http')
    const backend = httpModule.createServer((req, res) => {
      res.removeHeader('Content-Type')
      res.end('raw')
    })
    await new Promise((resolve) => backend.listen(0, resolve))

    const front = httpModule.createServer(
      assetProxy({ favicon: `http://127.0.0.1:${backend.address().port}/favicon.ico` })
    )
    await new Promise((resolve) => front.listen(0, resolve))

    const response = await new Promise((resolve, reject) => {
      httpModule.get(`http://127.0.0.1:${front.address().port}/favicon`, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => resolve({ statusCode: res.statusCode, body, headers: res.headers }))
      }).on('error', reject)
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('raw')
    expect(response.headers['cache-control']).toBe('public, max-age=3600')

    front.close()
    backend.close()
  })

  test('closes the response when the backend dies after the body starts', async () => {
    const httpModule = require('http')
    // Headers and a chunk, then a pause long enough for the proxy to flush
    // them downstream, then the socket goes. The proxy can no longer send a
    // status, so its only honest move is to close the response too.
    const flaky = httpModule.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Content-Length': '10000' })
      res.write('<svg')
      setTimeout(() => res.socket.destroy(), 100)
    })
    await new Promise((resolve) => flaky.listen(0, resolve))

    const front = httpModule.createServer(
      assetProxy({ logo: `http://127.0.0.1:${flaky.address().port}/logo.svg` })
    )
    await new Promise((resolve) => front.listen(0, resolve))

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ hung: true }), 4000)
      const settle = (value) => { clearTimeout(timer); resolve(value) }
      httpModule.get(`http://127.0.0.1:${front.address().port}/logo`, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => settle({ ended: true, body }))
        res.on('error', () => settle({ aborted: true, body }))
      }).on('error', reject)
    })

    expect(result.hung).toBeUndefined()
    expect(result.body.length).toBeLessThan(10000)

    front.close()
    flaky.close()
  })

  test('refuses everything not on the allowlist', () => {
    const handler = assetProxy({ logo: 'http://backend/logo.svg' })

    for (const url of [
      '/favicon', '/logo/../settings.php', '/', '/anything?x=1',
      // Inherited members of a plain object are truthy and are not strings,
      // so these reached startsWith() and threw a 500.
      '/constructor', '/__proto__', '/toString', '/valueOf', '/hasOwnProperty',
    ]) {
      const res = respond()
      handler({ url }, res)
      expect(res.statusCode).toBe(404)
    }
  })
})

describe('download', () => {
  const serve = (handler) => new Promise((resolve) => {
    const httpModule = require('http')
    const server = httpModule.createServer(handler)
    server.listen(0, () => resolve({ server, port: server.address().port }))
  })

  test('returns the bytes, not a string', async () => {
    const bytes = Buffer.from([0x00, 0x00, 0x01, 0x00, 0xff, 0xfe])
    const { server, port } = await serve((req, res) => {
      res.setHeader('Content-Type', 'image/vnd.microsoft.icon')
      res.end(bytes)
    })

    const got = await download(`http://127.0.0.1:${port}/favicon.ico`)
    server.close()

    expect(Buffer.isBuffer(got)).toBe(true)
    expect(got.equals(bytes)).toBe(true)
  })

  test('rejects on a non-200, naming the URL', async () => {
    const { server, port } = await serve((req, res) => {
      res.statusCode = 404
      res.end('gone')
    })

    await expect(download(`http://127.0.0.1:${port}/logo.svg`))
      .rejects.toThrow(`HTTP 404 for http://127.0.0.1:${port}/logo.svg`)
    server.close()
  })

  test('rejects when the host cannot be reached', async () => {
    await expect(download('http://127.0.0.1:1/logo.svg'))
      .rejects.toThrow('[decoupled-settings] asset fetch failed for http://127.0.0.1:1/logo.svg')
  })

  test('gives up on a backend that accepts and never answers', async () => {
    const { server, port } = await serve(() => {})
    await expect(download(`http://127.0.0.1:${port}/logo.svg`, { timeout: 60 }))
      .rejects.toThrow('[decoupled-settings] asset fetch failed')
    server.close()
  })

  test('rejects when the backend dies part way through the bytes', async () => {
    const { server, port } = await serve((req, res) => {
      res.setHeader('Content-Length', '1000')
      res.write('half')
      res.socket.destroy()
    })

    await expect(download(`http://127.0.0.1:${port}/logo.svg`)).rejects.toThrow()
    server.close()
  })

  test('chooses https for an https URL', async () => {
    // Nothing listens, so the rejection is the proof it used the https agent
    // rather than falling back to plain http.
    await expect(download('https://127.0.0.1:1/logo.svg')).rejects.toThrow('asset fetch failed')
  })
})

describe('writeAssets', () => {
  test('writes each asset under _decoupled, keeping its name', async () => {
    const writeFile = jest.fn().mockResolvedValue()
    const mkdir = jest.fn().mockResolvedValue()
    const doDownload = jest.fn().mockResolvedValue(Buffer.from('bytes'))

    const written = await writeAssets(
      { 'logo.svg': 'http://backend/logo.svg', 'favicon.ico': 'http://backend/favicon.ico' },
      '/out/dist',
      { writeFile, mkdir, download: doDownload }
    )

    expect(mkdir).toHaveBeenCalledWith('/out/dist/_decoupled', { recursive: true })
    expect(writeFile).toHaveBeenCalledWith('/out/dist/_decoupled/logo.svg', Buffer.from('bytes'))
    expect(writeFile).toHaveBeenCalledWith('/out/dist/_decoupled/favicon.ico', Buffer.from('bytes'))
    expect(written).toEqual(['logo.svg', 'favicon.ico'])
  })

  test('surfaces a failed download rather than writing a truncated file', async () => {
    const writeFile = jest.fn().mockResolvedValue()
    const mkdir = jest.fn().mockResolvedValue()
    const doDownload = jest.fn().mockRejectedValue(new Error('asset fetch failed: HTTP 403'))

    await expect(writeAssets({ 'logo.svg': 'http://backend/logo.svg' }, '/out', {
      writeFile, mkdir, download: doDownload,
    })).rejects.toThrow('HTTP 403')
    expect(writeFile).not.toHaveBeenCalled()
  })
})

describe('getToken', () => {
  test('throws on a rejected grant', async () => {
    const doRequest = jest.fn().mockResolvedValue({ status: 400, body: '{}' })

    await expect(getToken({ baseUrl: 'http://b', clientId: 'a', clientSecret: 'b' }, doRequest))
      .rejects.toThrow('HTTP 400')
  })

  test('sends the configured scope, and a default when none is given', async () => {
    const doRequest = jest.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: 'tok' }),
    })

    await getToken({ baseUrl: 'http://b', clientId: 'a', clientSecret: 'b', scope: 'reporting_app' }, doRequest)
    expect(doRequest.mock.calls[0][1].body).toContain('scope=reporting_app')

    // Simple OAuth 6 resolves no default for client_credentials, so the
    // module names one rather than sending an empty scope.
    await getToken({ baseUrl: 'http://b', clientId: 'a', clientSecret: 'b' }, doRequest)
    expect(doRequest.mock.calls[1][1].body).toContain('scope=frontend_app')
  })

  test('returns the access token from a granted request', async () => {
    const doRequest = jest.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
    })

    await expect(getToken({ baseUrl: 'http://b', clientId: 'a', clientSecret: 'b' }, doRequest))
      .resolves.toBe('tok')
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
      nuxt: { hook: jest.fn() },
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
    ).toBe('/_decoupled/favicon.ico')
  })

  test('the generate hook writes the assets the proxy would have served', async () => {
    const httpModule = require('http')
    const os = require('os')
    const nodeFs = require('fs')
    const nodePath = require('path')

    const server = httpModule.createServer((req, res) => {
      if (req.url === '/jsonapi/decoupled/settings') {
        res.setHeader('Content-Type', 'application/vnd.api+json')
        res.end(JSON.stringify({
          data: {
            attributes: {
              consumer: 'partner_frontend',
              settings: {
                'system.site': { name: 'Partner Portal' },
                'olivero.settings': { favicon: { url: '/favicon.ico' } },
              },
            },
          },
        }))
        return
      }
      res.setHeader('Content-Type', 'image/vnd.microsoft.icon')
      res.end(Buffer.from([0x00, 0x00, 0x01, 0x00]))
    })
    await new Promise((resolve) => server.listen(0, resolve))
    const { port } = server.address()

    let generateHook
    const mock = {
      addServerMiddleware: jest.fn(),
      nuxt: { hook: jest.fn((name, handler) => { generateHook = handler }) },
      options: { head: {} },
    }
    await DruxtDecoupledSettingsModule.call(mock, {
      baseUrl: `http://127.0.0.1:${port}`,
      consumerId: 'partner_frontend',
    })

    const distPath = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'dds-generate-'))
    const info = jest.spyOn(console, 'info').mockImplementation(() => {})
    await generateHook({ distPath })
    info.mockRestore()
    server.close()

    const written = nodePath.join(distPath, '_decoupled', 'favicon.ico')
    expect(nodeFs.existsSync(written)).toBe(true)
    expect(nodeFs.readFileSync(written).length).toBe(4)
    // The same path the settings were rewritten to, so one URL is true for a
    // served build and a generated one.
    expect(
      mock.options.publicRuntimeConfig.decoupledSettings['olivero.settings'].favicon.url
    ).toBe('/_decoupled/favicon.ico')
    nodeFs.rmSync(distPath, { recursive: true, force: true })
  })

  test('leaves the head alone and skips the proxy when nothing needs them', async () => {
    const httpModule = require('http')
    const server = httpModule.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/vnd.api+json')
      // No theme group, so there is no asset for the proxy to serve.
      res.end(JSON.stringify({
        data: { attributes: { consumer: null, settings: { 'system.site': { name: 'Plain' } } } },
      }))
    })
    await new Promise((resolve) => server.listen(0, resolve))
    const { port } = server.address()

    const mock = {
      addServerMiddleware: jest.fn(),
      nuxt: { hook: jest.fn() },
      options: { head: { title: 'Set by the app' } },
    }
    await DruxtDecoupledSettingsModule.call(mock, {
      baseUrl: `http://127.0.0.1:${port}`,
      applyHead: false,
    })
    server.close()

    expect(mock.addServerMiddleware).not.toHaveBeenCalled()
    expect(mock.options.head.title).toBe('Set by the app')
    expect(mock.options.publicRuntimeConfig.decoupledSettings['system.site'].name).toBe('Plain')
    expect(mock.options.publicRuntimeConfig.decoupledConsumer).toBeNull()
  })
})
