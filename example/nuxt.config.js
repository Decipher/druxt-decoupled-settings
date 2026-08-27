export default {
  // Nuxt does not read this variable by itself, and each consumer needs its
  // own directory: the settings are baked into the build, so a shared one
  // means last build wins.
  buildDir: process.env.NUXT_BUILD_DIR || '.nuxt',

  modules: [
    '@druxt-contrib/decoupled-settings',
    'druxt',
  ],

  druxt: {
    baseUrl: process.env.BASE_URL || 'http://localhost:8080',
  },

  decoupledSettings: {
    // Which consumer this build renders as. Everything else falls back to
    // the environment: OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_SCOPE.
    consumerId: process.env.DRUXT_CONSUMER_ID,
  },

  // Druxt 0.21 pulls consola, whose browser build ships as .mjs. Webpack 4
  // cannot parse that without help.
  build: {
    transpile: ['consola'],
  },
}
