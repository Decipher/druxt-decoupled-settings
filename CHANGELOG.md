# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 (unreleased)

### Added
- Build-time consumer identity for Druxt. The module reads
  `/jsonapi/decoupled/settings` as one consumer and bakes the resolved
  settings into `publicRuntimeConfig`, so one codebase builds as many
  differently branded sites.
- Optional OAuth2 client credentials authentication, for settings that are
  not readable anonymously. With Simple OAuth the token identifies the
  consumer by itself.
- The consumer's site name and slogan become the document title, and the
  active theme's favicon replaces the static one. `applyHead: false` opts
  out.
- A scoped asset proxy under `/_decoupled/`. Its allowlist is exactly the
  files the settings name, so nothing else is reachable through it and the
  backend does not have to expose its assets publicly. `nuxt generate` writes
  the same files into the generated output, because a static build has no
  middleware to run.
- A warning when the consumer that answered is not the one that was asked
  for. Drupal returns the global values with HTTP 200 for a client_id it
  cannot find, and an OAuth token names its own consumer whatever the header
  says. Both used to be silent.
- A Playwright end-to-end suite that doubles as the screenshot generator,
  so every published screenshot is taken after assertions pass on the thing
  pictured.

### Known limitations
- `publicRuntimeConfig` resolves on every `nuxt start`, so the consumer
  environment has to be present on the start command as well as the build,
  and the backend has to be reachable at start. The document head is written
  into the build, so a restart alone leaves the old title in place.
- Each consumer needs its own `buildDir`, mapped in `nuxt.config.js`, because
  Nuxt does not read one from the environment.
- Everything the endpoint returns reaches the browser through
  `publicRuntimeConfig`. The Drupal exposure list is the boundary.
- Nuxt 2 only, matching Druxt.
