<template>
  <section>
    <h3>Props</h3>
    <table>
      <tbody>
        <slot />
      </tbody>
    </table>
  </section>
</template>
<style scoped>
h3 {
  @apply text-base;
}
table ::v-deep(tr + tr) > td {
  @apply pt-3;
}
table ::v-deep(td) {
  @apply w-1/3;
}
table ::v-deep(td:first-child) {
  @apply text-lg;
  font-family: monospace;
}
table ::v-deep(td:last-child) {
  @apply text-sm leading-5;
}
</style>
