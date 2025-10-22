<template>
  <footer class="bg-gray-100">
    <div class="leading-6 max-w-4xl mx-auto px-18 py-16 box-border text-gray-700 text-sm text-center">
      <p class="flex justify-center m-0 font-medium flex-wrap">
        <router-link to="/privacy"> Privacy </router-link>
        <router-link to="/terms"> Terms </router-link>
        <router-link to="/publications"> Publications </router-link>
        <a href="https://github.com/metaspace2020/metaspace">GitHub</a>
        <a href="https://twitter.com/metaspace2020">Twitter</a>
        <router-link to="/faq">FAQ</router-link>
        <router-link to="/contact">Contact</router-link>
      </p>
      <p class="m-0 mt-8">
        &copy; 2014&ndash;2025 <a target="_blank" href="https://ateam.ucsd.edu/">Alexandrov Team</a>
      </p>
    </div>
  </footer>
</template>

<script>
import { RouterLink } from 'vue-router'
export default {
  name: 'MetaspaceFooter',
  components: {
    RouterLink,
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
