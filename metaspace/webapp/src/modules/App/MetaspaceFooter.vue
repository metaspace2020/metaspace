<template>
  <footer class="bg-gray-100">
    <div class="leading-6 max-w-4xl mx-auto px-18 py-16 box-border text-gray-700 text-sm text-center">
      <p class="flex justify-center m-0 font-medium flex-wrap">
        <a v-if="themeVariant === 'pro'" :href="config.urls.privacy" target="_blank">Privacy</a>
        <router-link v-else to="/privacy">Privacy</router-link>
        <a v-if="themeVariant === 'pro'" :href="config.urls.terms" target="_blank">Terms</a>
        <router-link v-else to="/terms">Terms</router-link>
        <router-link to="/publications"> Publications </router-link>
        <a href="https://github.com/metaspace2020/metaspace">GitHub</a>
        <router-link to="/faq">FAQ</router-link>
        <router-link to="/contact">Contact</router-link>
      </p>
      <p class="m-0 mt-8">
        &copy; 2014&ndash;2025
        <a target="_blank" href="https://ateam.ucsd.edu/">
          <span v-if="themeVariant === 'pro'">Metacloud Inc.</span>
          <span v-else>Alexandrov Team</span>
        </a>
      </p>
    </div>
  </footer>
</template>

<script>
import { RouterLink } from 'vue-router'
import { useStore } from 'vuex'
import { computed } from 'vue'
import config from '../../lib/config'

export default {
  name: 'MetaspaceFooter',
  components: {
    RouterLink,
  },
  setup() {
    const store = useStore()
    const themeVariant = computed(() => store?.getters?.themeVariant)
    return {
      themeVariant,
      config,
    }
  },
}
</script>

<style scoped>
a {
  color: inherit;
}
.flex > a {
  @apply mx-6;
}
</style>
