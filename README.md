# DruxtDecoupledSettings

> Bakes Drupal [Decoupled Settings](https://www.drupal.org/project/decoupled_settings)
> into the Nuxt build, per consumer.

The same frontend code renders as whichever site its consumer is: at build
time the app identifies itself as a Drupal consumer, optionally authenticates
with OAuth2 client credentials, reads `/jsonapi/decoupled/settings`, and bakes
the resolved settings into `publicRuntimeConfig`. The consumer's site name and
slogan become the document title, and the active theme's resolved favicon
replaces the static one.

This is the app authenticating, not a user.
[druxt-auth](https://github.com/druxt/druxt-auth) covers the user login flow.

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

The consumer's logo and favicon are served from the frontend's own origin
under `/_decoupled/`, keeping the source file extension, by a server
middleware whose allowlist is exactly the files the settings name. Nothing
else is reachable through it, and the backend does not have to expose its
assets publicly. The settings are rewritten to these paths, so components can
use `logo.url` as it is.

`nuxt generate` has no server to run that middleware, so the module writes the
same files into the generated output at the same paths. One URL is true for a
served build and a generated one.

Anywhere in the app:

```js
this.$config.decoupledSettings['system.site'].name
this.$config.decoupledConsumer
this.$config.decoupledBaseUrl
```

The theme's group is whichever one holds `logo.url` or `favicon.url`, not the
one whose name ends in `.settings`: the backend appends theme settings after
every object an administrator exposed, and `user.settings` ends that way too.

Run the same code twice with different `DRUXT_CONSUMER_ID` values to render
two differently branded sites from one backend. Give each consumer its own
`buildDir` as well. Nuxt does not read a build directory from the environment,
so map one yourself, as the example does:

```js
buildDir: process.env.NUXT_BUILD_DIR || '.nuxt',
```

### Set the consumer on `start` as well as on `build`

`publicRuntimeConfig` is Nuxt 2 runtime configuration: it resolves when the
server starts, not when the build runs. This module is a Nuxt module, so it
runs on `nuxt start` too. Pass the same environment to both commands, or the
served page carries the build's title over the global settings:

```sh
DRUXT_CONSUMER_ID=public_frontend NUXT_BUILD_DIR=.nuxt-public npm run build
DRUXT_CONSUMER_ID=public_frontend NUXT_BUILD_DIR=.nuxt-public PORT=3000 npm start
```

The runtime config and the document head go stale differently:

| | Refreshes on | Consequence |
|---|---|---|
| `publicRuntimeConfig` | every `start` | the backend has to be reachable at start, or the server does not come up |
| document head | every `build` | a restart alone leaves the old title in place |

The module warns when the consumer that answered is not the one asked for,
which covers a typo in `DRUXT_CONSUMER_ID`, where Drupal answers 200 with the
global values, and an OAuth token whose consumer is not the one in the header,
where the token wins.

### Everything exposed becomes public

`publicRuntimeConfig` is serialised into the page, so every key the endpoint
returns is readable in the page source. The exposure list on the Drupal side
is the whole boundary. Decoupled Settings bounds each object by its typed
config schema and excludes `system.site:mail` and
`system.site:mail_notification` out of the box, but check the list before
pointing this at a production backend.

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
  client_credentials token resolves the consumer by itself. Simple OAuth
  injects the consumer identity into the request, so `consumerId` is only
  needed for anonymous fetches.

## Example

[`example/`](example/) is a Nuxt app that builds twice from one codebase and
renders as two different sites. Its README covers the Drupal side.

## Development

```sh
npm install
npm test          # jest, with coverage thresholds
npm run lint
npm run build
```

The Playwright suite in `test/e2e/` runs against a provisioned Drupal and two
built frontends, and doubles as the screenshot generator, so a published
screenshot is always taken after the assertions on it pass. It needs
`DRUPAL_URL`, `FRONTEND_PUBLIC_URL` and `FRONTEND_PARTNER_URL`, and
`DRUPAL_LOGIN_LINK` for the administrative screens:

```sh
npm run test:e2e
```

CI runs lint, the jest suite and the build. The end-to-end suite is not run
there, because it needs a live backend.
