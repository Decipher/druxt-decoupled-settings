# DruxtDecoupledSettings

> Bakes Drupal [Decoupled Settings](https://www.drupal.org/project/decoupled_settings)
> into the Nuxt build, per consumer.

The same frontend code renders as whichever site its consumer is: at build
time the app identifies itself as a Drupal consumer, optionally authenticates
with OAuth2 client credentials, reads `/jsonapi/decoupled/settings`, and bakes
the resolved settings into `publicRuntimeConfig`. The consumer's site name and
slogan become the document title, and the active theme's resolved favicon
replaces the static one.

This is the app authenticating, not a user. [druxt-auth](https://github.com/druxt/druxt-auth)
covers the user login flow; nothing covered the build-time flow before this
module.

## Install

```sh
npm install @druxt-contrib/decoupled-settings
```

## Usage

```js
// nuxt.config.js
export default {
  modules: [
    '@druxt-contrib/decoupled-settings',
    'druxt-site',
  ],
  druxt: {
    baseUrl: 'https://drupal.example.com',
  },
  decoupledSettings: {
    // Everything is optional and falls back to the environment.
    consumerId: process.env.DRUXT_CONSUMER_ID,
    clientId: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    scope: process.env.OAUTH_SCOPE,
    applyHead: true,
  },
}
```

## Asset proxy

The consumer's logo and favicon are served from the frontend's own origin at
`/_decoupled/logo` and `/_decoupled/favicon`, by a server middleware whose
allowlist is exactly the files the settings name. The backend needs no public
exposure for assets, and nothing outside the allowlist is reachable - this is
a proxy to named files, never to the backend. The baked settings are rewritten
to these paths, so components can use `logo.url` as it is.

Anywhere in the app:

```js
this.$config.decoupledSettings['system.site'].name
this.$config.decoupledConsumer
```

Run the same code twice with different `DRUXT_CONSUMER_ID` values (and, in
dev, different `NUXT_BUILD_DIR` values, since the head is baked into the
build) to render two differently branded sites from one backend.

## Options

| Option | Env fallback | Purpose |
|---|---|---|
| `baseUrl` | `BASE_URL`, or `druxt.baseUrl` | The Drupal backend. |
| `consumerId` | `DRUXT_CONSUMER_ID` | Consumer `client_id` whose overrides apply. |
| `clientId` / `clientSecret` | `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` | OAuth2 client_credentials pair. Without them the fetch is anonymous. |
| `scope` | `OAUTH_SCOPE` | OAuth2 scope. Simple OAuth 6 resolves no default for client_credentials, so it must exist. |
| `applyHead` | - | Apply title and favicon to the document head. Default `true`. |

## Drupal requirements

- [Decoupled Settings](https://www.drupal.org/project/decoupled_settings) with the
  `read decoupled settings` permission granted to whoever fetches: the
  anonymous role for public consumers, or a role reachable through an OAuth2
  scope for authenticated ones.
- [Consumers](https://www.drupal.org/project/consumers). With
  [Simple OAuth](https://www.drupal.org/project/simple_oauth), a
  client_credentials token resolves the consumer by itself - Simple OAuth
  injects the consumer identity into the request, so `consumerId` is only
  needed for anonymous fetches.

## Development

```sh
npm install
npm test
npm run lint
npm run build
```
