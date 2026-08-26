# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 (unreleased)

### Added
- Build-time consumer identity for Druxt. The module reads
  `/jsonapi/decoupled/settings` as a named consumer and bakes the resolved
  settings into `publicRuntimeConfig`, so one codebase builds as many
  differently branded sites.
- Optional OAuth2 client credentials authentication, for settings that are
  not readable anonymously. With Simple OAuth the token identifies the
  consumer by itself.
- The consumer's site name and slogan become the document title, and the
  active theme's favicon replaces the static one. `applyHead: false` opts
  out.
- A scoped asset proxy at `/_decoupled/logo` and `/_decoupled/favicon`. Its
  allowlist is exactly the files the settings name, so the backend needs no
  public exposure for assets and nothing else is reachable through it.
- A Playwright end-to-end suite that doubles as the screenshot generator,
  so every published screenshot is taken after assertions pass on the thing
  pictured.

### Known limitations
- Settings are read at build time, so a settings change means a rebuild.
  That is the same contract as environment variables in a static build.
- Each consumer needs its own `NUXT_BUILD_DIR`: the document head is baked
  into the build, so a shared directory means last build wins.
- Nuxt 2 only, matching Druxt.
