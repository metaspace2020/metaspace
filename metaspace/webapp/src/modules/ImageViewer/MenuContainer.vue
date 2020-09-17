<template>
  <div class="absolute top-0 right-0 h-full py-3 pr-3 box-border">
    <div
      class="py-3 bg-gray-100-alpha w-60 rounded-lg h-full box-border"
      data-menu-items
    >
      <slot />
    </div>
  </div>
</template>
<style scoped>
  [data-menu-items] > * {
    @apply box-border border-0 border-t border-solid border-gray-200-alpha relative;
  }
  [data-menu-items] > *::after {
    @apply absolute w-full h-full box-border top-0 left-0 pointer-events-none;
    content: '';
  }
  [data-menu-items] > *:focus::after {
    @apply border border-solid border-primary;
  }
</style>
