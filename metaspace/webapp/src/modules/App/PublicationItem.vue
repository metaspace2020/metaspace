<template>
  <li>
    <h3 class="text-blue-800 text-base font-medium m-0">
      {{ title }}
    </h3>
    <p>
      {{ authors }}
    </p>
    <p class="text-sm font-medium">
      <span class="text-green-800">{{ publisher }}</span>, <time>{{ year }}</time>
    </p>
    <p class="text-sm truncate text-primary">
      <a :href="link">{{ link }}</a>
    </p>
  </li>
</template>
<script>
export default {
  name: 'Reference',
  props: {
    authors: String,
    link: String,
    publisher: String,
    title: String,
    year: String,
  },
}
</script>
