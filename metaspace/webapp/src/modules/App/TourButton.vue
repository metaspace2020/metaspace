<template>
  <button
    class="button-reset text-primary flex items-center p-0"
    @click="$emit('click')"
  >
    <span class="mr-2 text-sm font-medium">Take the tour</span>
    <i class="el-icon-caret-right rounded-full transition-colors duration-150 ease-in-out p-1 -my-1" />
  </button>
</template>
<script>
export default {
  name: 'TourButton',
}
</script>
<style scoped>
  button:hover /deep/ i,
  button:focus /deep/ i {
    @apply bg-primary text-white;
  }
</style>
