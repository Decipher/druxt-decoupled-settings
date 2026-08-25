import DruxtDecoupledSettingsModule, { applyToHead, fetchSettings, getToken } from '../src'

const attributes = {
  consumer: 'partner_frontend',
  settings: {
    'system.site': { name: 'Partner Portal', slogan: 'Same code, different consumer' },
    'olivero.settings': {
      favicon: { url: '/core/themes/olivero/favicon.ico', mimetype: 'image/vnd.microsoft.icon' },
    },
  },
}

const jsonapiResponse = { status: 200, body: JSON.stringify({ data: { attributes } }) }

describe('applyToHead', () => {
  test('builds the title from the site name and slogan', () => {
    const head = applyToHead({}, attributes)
    expect(head.title).toBe('Same code, different consumer')
    expect(head.titleTemplate('Welcome!')).toBe('Welcome! | Partner Portal')
    expect(head.titleTemplate(head.title)).toBe('Same code, different consumer | Partner Portal')
    expect(head.titleTemplate('')).toBe('Partner Portal')
  })

  test('uses the name alone when there is no slogan', () => {
    const head = applyToHead({}, {
      consumer: null,
      settings: { 'system.site': { name: 'Solo' } },
    })
    expect(head.title).toBe('')
    expect(head.titleTemplate('')).toBe('Solo')
  })

  test('replaces the icon with the resolved theme favicon', () => {
    const head = applyToHead(
      { link: [{ rel: 'icon', href: '/favicon.ico' }] },
      attributes,
      'http://backend:8888'
    )
    expect(head.link).toHaveLength(1)
    expect(head.link[0]).toEqual({
      rel: 'icon',
      type: 'image/vnd.microsoft.icon',
      href: 'http://backend:8888/core/themes/olivero/favicon.ico',
    })
  })

  test('leaves non-icon links alone', () => {
    const head = applyToHead({ link: [{ rel: 'preconnect', href: 'x' }] }, attributes, '')
    expect(head.link.map((l) => l.rel).sort()).toEqual(['icon', 'preconnect'])
  })

  test('changes nothing without exposed site settings', () => {
    const head = applyToHead({ title: 'kept' }, { consumer: null, settings: {} })
    expect(head.title).toBe('kept')
  })
})

describe('fetchSettings', () => {
  test('sends the consumer header and returns the attributes', async () => {
    const doRequest = jest.fn().mockResolvedValue(jsonapiResponse)

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
      .mockResolvedValueOnce(jsonapiResponse)

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
  })
})
