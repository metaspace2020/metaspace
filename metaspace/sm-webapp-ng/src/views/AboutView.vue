<template>
  <div class="about">
    <h1 @click="throwError">This ids an about page</h1>
  </div>
</template>

<script>

export default {
  methods: {
    throwError() {
      console.log('oi')
      this.$notify({
        title: 'Error',
        message: 'This is a error message',
        type: 'error',
      })
      // this.$alert('This is a message', 'Title', {
      //   confirmButtonText: 'OK',
      //   callback: (action) => {
      //     this.$message({
      //       type: 'info',
      //       message: `action: ${action}`,
      //     })
      //   },
      // })
    },
  },
}
</script>
