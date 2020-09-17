<template>
  <div class="absolute top-0 right-0 h-full py-3 pr-2 box-border">
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
    @apply box-border border-0 border-t border-solid border-gray-200-alpha;
  }
  [data-menu-items] > *:focus {
    outline: 1px solid theme('colors.primary');
    outline-offset: none;
  }
</style>
