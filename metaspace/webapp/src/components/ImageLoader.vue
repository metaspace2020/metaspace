<template>
  <div class="image-loader"
       v-loading="isLoading"
       :element-loading-text="message">
    <img :src="src" :alt="alt" ref="image"/>
  </div>
</template>

<script>
 // uses loading directive from Element-UI

 export default {
   props: {
     src: {
       type: String,
       required: true
     },
     alt: {
       type: String,
       default: ''
     }
   },
   data () {
     return {
       isLoading: false,
       message: ''
     }
   },
   mounted () {
     let image = this.$refs.image;
     image.onload = this.onLoad.bind(this);
     image.onerror = image.onabort = this.onFail.bind(this);
   },
   watch: {
     'src' (url) {
       this.isLoading = true;
     }
   },
   methods: {
     onLoad (res) {
       this.isLoading = false;
     },
     onFail () {
       this.message = "Oops, something went wrong :-("
     }
   }
 }
</script>
