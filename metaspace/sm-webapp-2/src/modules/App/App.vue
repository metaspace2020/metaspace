<template>
  <div
    class="min-h-full m-0 relative"
    :class="{ 'flex flex-col': $route.meta.flex }"
  >
    <metaspace-header :class="$route.meta.headerClass" />

    <!--
      :key="$route.path" is used to force the content to be remounted if a non-querystring param in the URL changes.
      This ensures that a loading screen is displayed and no unnecessary state is retained when e.g. switching
      between group profile pages or datasets
    -->
    <router-view
      :key="$route.path"
      class="sm-main-content"
      :class="{ 'flex-grow w-full': $route.meta.flex }"
    />

    <metaspace-footer v-if="$route.meta.footer" />

  </div>
</template>

<script>
import { useCookies } from 'vue3-cookies'
import config from '../../lib/config'
import safeJsonParse from '../../lib/safeJsonParse'

import MetaspaceHeader from './MetaspaceHeader'
import MetaspaceFooter from './MetaspaceFooter.vue'


/** @type {ComponentOptions<Vue> & Vue} */
export default {
  name: 'App',
  components: {
    MetaspaceHeader,
    MetaspaceFooter,
  },
  data() {
    return {
      features: config.features,
    }
  },
  async created() {
    const { cookies } = useCookies()
    const flashMessage = safeJsonParse(cookies.get('flashMessage'))
    if (flashMessage) {
      try {
        if (flashMessage.type === 'verify_email_success') {
          await this.$alert('Your email address was successfully verified. You may now upload datasets to METASPACE.',
            'Welcome to METASPACE', { type: 'success' })
        } else if (flashMessage.type === 'verify_email_failure') {
          await this.$alert('This email verification link is invalid or has expired. '
            + 'Try signing in or resetting your password. '
            + 'If this keeps happening, please <a href="mailto:contact@metaspace2020.eu">let us know</a>.',
            'Something went wrong!', { type: 'warning', dangerouslyUseHTMLString: true })
        } else if (flashMessage.type === 'review_token_success') {
          await this.$alert('You have been granted access to a private project.',
            'Welcome to METASPACE', { type: 'success' })
        }
      } catch (err) {
        // Ignore any errors - promise rejection here just means that the user cancelled out of the dialog
      } finally {
        cookies.remove('flashMessage')
      }
    }
  },
}
</script>


<style>
@font-face {
  /* Roboto doesn't contain superscript glyphs, and the fallback is OS-dependent. OSX's fallback, Helvetica,
   looks bad for the superscript + and - characters in formatted ion formulas, because it's too small to read. */
  font-family: SUPERSCIPT_OVERRIDE;
  src: local('Lucida Grande'), local('-apple-system'), local('serif');
  unicode-range: U+207A-207B;
}

@font-face {
  font-display: swap;
  font-family: "FuturaBT-Medium";
  src: url("../../assets/fonts/futura/2FD17E_0_0.eot");
  src: url("../../assets/fonts/futura/2FD17E_0_0.eot?#iefix") format("embedded-opentype"), url("../../assets/fonts/futura/2FD17E_0_0.woff2") format("woff2"), url("../../assets/fonts/futura/2FD17E_0_0.woff") format("woff"), url("../../assets/fonts/futura/2FD17E_0_0.ttf") format("truetype");
  font-style: normal;
  font-weight: normal;
}

html {
  @apply font-sans;
  overflow-y: scroll; /* always show the right scrollbar to avoid flickering */
}

/* http://matthewjamestaylor.com/blog/keeping-footers-at-the-bottom-of-the-page */
html, body {
  height: 100%;
  margin: 0;
  padding: 0;
}

#app {
  @apply text-body;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2 {
  @apply font-medium;
}

h1 {
  @apply tracking-tight;
}

h2 {
  @apply tracking-snug;
}

a {
  @apply text-primary;
}

a:hover {
  text-decoration: none;
}

input, button {
  font: inherit;
}

.el-loading-mask {
  /* otherwise filter dropdowns are behind it */
  z-index: 2000;
}

.sm-main-content {
  padding-top: 10px;
  padding-bottom: 32px; /* cookies banner height */
  overflow: auto;
  min-height: calc(100vh - 316px);
}
</style>
