<template>
  <section>
    <h3>Example</h3>
    <div class="sm-component-example box-border p-6 rounded shadow-md border border-solid border-gray-100">
      <slot />
    </div>
  </section>
</template>
<style scoped>
.sm-component-example {
  min-height: theme('spacing.18');
}
h3 {
  @apply text-base;
}
</style>
