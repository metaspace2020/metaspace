<template>
  <i class="fill-current flex w-6 h-6">
    <slot />
  </i>
</template>
<style scoped>
i >>> .primary {
  @apply text-blue-100;
}
i >>> .secondary {
  @apply text-blue-800;
}
</style>
