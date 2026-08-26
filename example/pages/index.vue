<template>
  <main>
    <img
      v-if="logo"
      :src="logo"
      :alt="name"
      height="60"
    >
    <h1>{{ name }}</h1>
    <p v-if="slogan">
      {{ slogan }}
    </p>
    <p>
      Rendered as consumer <code>{{ consumer || 'none, global values' }}</code>.
    </p>
    <pre>{{ settings }}</pre>
  </main>
</template>

<script>
export default {
  // Nuxt routes this file as the root page, so the single-word name is
  // required rather than a choice.
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'Index',

  computed: {
    settings() {
      return this.$config.decoupledSettings || {}
    },

    consumer() {
      return this.$config.decoupledConsumer
    },

    site() {
      return this.settings['system.site'] || {}
    },

    name() {
      return this.site.name || 'No site name exposed'
    },

    slogan() {
      return this.site.slogan
    },

    // The module rewrites theme asset URLs to its own proxy, so this path
    // is served by the frontend and the backend needs no public exposure.
    logo() {
      const theme = Object.entries(this.settings)
        .find(([group]) => group !== 'system.site' && group.endsWith('.settings'))

      return theme ? (theme[1].logo || {}).url : undefined
    },
  },
}
</script>
