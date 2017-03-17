<template>
  <div class="image-loader"
       v-loading="isLoading"
       ref="parent"
       :element-loading-text="message">
    <canvas ref="canvas" class="mz-img-canvas">
    </canvas>
  </div>
</template>

<script>
 // uses loading directive from Element-UI

 import {createColormap} from '../util.js';

 export default {
   props: {
     src: {
       type: String,
       required: true
     },
     maxHeight: {
       type: Number,
       default: 500
     },
     colormap: {
       type: String,
       default: 'Viridis'
     }
   },
   data () {
     return {
       image: new Image(),
       scaleFactor: 1,
       isLoading: false,
       message: ''
     }
   },
   created() {
     this.colors = createColormap(this.colormap);

     this.image.onload = this.onLoad.bind(this);
     this.image.onerror = this.image.onabort = this.onFail.bind(this);
     this.image.crossOrigin = "Anonymous";
     this.image.src = this.src.replace('alpha.metasp.eu', '52.51.114.30:4800');

     this.isLoading = true;
   },
   watch: {
     'src' (url) {
       this.image.crossOrigin = "Anonymous";
       this.image.src = url.replace('alpha.metasp.eu', '52.51.114.30:4800');
       this.isLoading = true;
     },
     'colormap' (name) {
       this.colors = createColormap(name);
       this.drawImage();
     }
   },
   methods: {
     onLoad (res) {
       this.isLoading = false;
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d"),
           parentWidth = Math.max(this.$refs.parent.offsetWidth, 750);

       ctx.setTransform(1, 0, 0, 1, 0, 0);

       // scale up small images to use as much canvas as possible
       var scale1 = parentWidth / this.image.width;
       var scale2 = this.maxHeight / this.image.height;
       this.scaleFactor = Math.max(1, Math.min(scale1, scale2));
       console.log(scale1, scale2, this.scaleFactor);
       canvas.width = this.image.width * this.scaleFactor;
       canvas.height = this.image.height * this.scaleFactor;
       ctx.scale(this.scaleFactor, this.scaleFactor);

       ctx.webkitImageSmoothingEnabled = false;
       ctx.mozImageSmoothingEnabled = false;
       ctx.msImageSmoothingEnabled = false;
       ctx.imageSmoothingEnabled = false;
       ctx.drawImage(this.image, 0, 0);

       var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
       this.grayscaleData = imageData.data;

       this.drawImage();
     },

     drawImage() {
       if (this.grayscaleData[0] === undefined)
         return;

       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d");

       var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
       var pixels = imageData.data;
       var numPixels = pixels.length / 4;
       var g = this.grayscaleData;

       for (let i = 0; i < numPixels; i++) {
         let c = this.colors[g[i*4]];
         pixels[i*4] = c[0];
         pixels[i*4+1] = c[1];
         pixels[i*4+2] = c[2];
       }

       ctx.clearRect(0, 0, canvas.width, canvas.height);
       ctx.putImageData(imageData, 0, 0);
     },

     onFail () {
       this.message = "Oops, something went wrong :-("
     }
   }
 }
</script>

<style>
 .mz-img-canvas {
   max-width: 100%;
 }
</style>
