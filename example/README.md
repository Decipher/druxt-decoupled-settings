# Example

One Nuxt codebase, built twice, rendering as two different sites.

## Drupal side

Any Drupal 10.3+ or 11 site with
[Decoupled Settings](https://www.drupal.org/project/decoupled_settings)
installed:

```sh
composer require drupal/decoupled_settings
drush en decoupled_settings
```

Expose `system.site` at **Configuration > Web services > Decoupled
Settings**, grant **Read decoupled settings** to the anonymous role (this
example fetches anonymously), then add two consumers at **Configuration >
Web services > Consumers** and give each one a **Settings** override for
`system.site:name`.

For an authenticated fetch instead, give the consumer a client secret and a
`client_credentials` scope whose role holds the permission, and set
`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` and `OAUTH_SCOPE`.

## Frontend side

```sh
npm install

# One consumer. Both commands need the same NUXT_BUILD_DIR, and start
# needs its own PORT: a variable prefix applies to one command only.
export BASE_URL=http://localhost:8080
DRUXT_CONSUMER_ID=public_frontend NUXT_BUILD_DIR=.nuxt-public npm run build
NUXT_BUILD_DIR=.nuxt-public PORT=3000 npm start

# The other, same code.
DRUXT_CONSUMER_ID=partner_frontend NUXT_BUILD_DIR=.nuxt-partner npm run build
NUXT_BUILD_DIR=.nuxt-partner PORT=3001 npm start
```

Separate build directories matter: the settings are baked into the build, so
each consumer needs its own. A settings change means a rebuild, exactly as it
would with environment variables.
