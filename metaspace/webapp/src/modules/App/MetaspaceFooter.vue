<template>
  <footer class="bg-gray-100">
    <div class="leading-6 max-w-4xl mx-auto px-18 py-16 box-border text-gray-700 text-sm text-center">
      <p class="flex justify-center m-0 font-medium flex-wrap">
        <router-link to="/privacy">
          Privacy
        </router-link>
        <router-link to="/terms">
          Terms
        </router-link>
        <router-link to="/publications">
          Publications
        </router-link>
        <a href="https://github.com/metaspace2020/metaspace">GitHub</a>
        <a href="https://twitter.com/metaspace2020">Twitter</a>
        <a href="mailto:contact@metaspace2020.eu">Contact</a>
      </p>
      <p class="m-0 mt-8">
        &copy; 2014&ndash;2023 <a href="https://www.embl.de/research/units/scb/alexandrov/">Alexandrov Team</a>
      </p>
    </div>
  </footer>
</template>

<script>
export default {
  name: 'MetaspaceFooter',
}
</script>

<style scoped>
  a {
    color: inherit;
  }
  .flex > a {
    @apply mx-6
  }
</style>
