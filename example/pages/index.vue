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

    // The module rewrites theme asset URLs to its own proxy, so this path is
    // served by the frontend. The theme is the group carrying the assets, not
    // the one whose name ends in ".settings": any other exposed object can
    // end that way too.
    logo() {
      const theme = Object.values(this.settings)
        .find((values) => values && values.logo && values.logo.url)

      return theme ? theme.logo.url : undefined
    },
  },
}
</script>
