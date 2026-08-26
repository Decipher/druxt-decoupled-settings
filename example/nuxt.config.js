export default {
  modules: [
    '@druxt-contrib/decoupled-settings',
  ],

  druxt: {
    baseUrl: process.env.BASE_URL || 'http://localhost:8080',
  },

  decoupledSettings: {
    // Which consumer this build renders as. Everything else falls back to
    // the environment: OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_SCOPE.
    consumerId: process.env.DRUXT_CONSUMER_ID,
  },
}
