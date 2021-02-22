<template>
  <table>
    <tbody>
      <slot />
    </tbody>
  </table>
</template>
<style scoped>
table >>> tr + tr > td {
  @apply pt-3;
}
table >>> td {
  @apply w-1/3;
}
table >>> td:first-child {
  @apply text-lg;
  font-family: monospace;
}
table >>> td:last-child {
  @apply text-sm leading-5;
}
</style>
