<template>
  <div class="about">
    <h1 @click="throwError">This is an about page</h1>
  </div>
</template>

<script>
export default {
  methods: {
    throwError () {
      throw new Error('Sentry Error')
    }
  }
}
</script>
