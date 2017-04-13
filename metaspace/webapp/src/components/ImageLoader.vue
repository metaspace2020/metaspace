<template>
  <div class="image-loader"
       v-loading="isLoading"
       ref="parent"
       :element-loading-text="message">
    <img :src="dataURI" :style="imageStyle" />

    <canvas ref="canvas" style="display:none;"></canvas>
  </div>
</template>

<script>
 // uses loading directive from Element-UI

 import {createColormap} from '../util.js';
 import {quantile} from 'simple-statistics';

 export default {
   props: {
     src: {
       type: String
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
       isLoading: false,
       message: '',
       dataURI: '',
       hotspotRemovalQuantile: 0.99
     }
   },
   created() {
     this.colors = createColormap(this.colormap);
     this.image.onload = this.redraw.bind(this);
     this.image.onerror = this.image.onabort = this.onFail.bind(this);
     this.image.crossOrigin = "Anonymous";
     this.image.src = this.src;

     this.isLoading = true;
   },
   computed: {
     imageStyle() {
       // assume the allocated screen space has width > height
       return {
         width: '100%',                       // maximize width
         'max-height': this.maxHeight + 'px', // limit height
         'object-fit': 'contain'              // keep aspect ratio
       };
     }
   },
   watch: {
     'src' (url) {
       this.image.crossOrigin = "Anonymous";
       this.image.src = url;
       this.isLoading = true;
     },
     'colormap' (name) {
       this.colors = createColormap(name);
       this.applyColormap();
     },
   },
   methods: {
     computeQuantile () {
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d");
       ctx.drawImage(this.image, 0, 0);

       let data = [],
           imageData = ctx.getImageData(0, 0, canvas.width, canvas.height),
           grayscaleData = imageData.data;

       for (let i = 0; i < grayscaleData.length; i += 4)
         if (grayscaleData[i] > 0)
           data.push(grayscaleData[i])

       return quantile(data, this.hotspotRemovalQuantile);
     },

     scaleToViewport() {
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d"),
           parentWidth = Math.max(this.$refs.parent.offsetWidth, 750);
       // scale up small images to use as much canvas as possible
       const scale1 = parentWidth / this.image.width,
             scale2 = this.maxHeight / this.image.height,
             scaleFactor = Math.max(1, Math.min(scale1, scale2));
       canvas.width = this.image.width * scaleFactor;
       canvas.height = this.image.height * scaleFactor;
       ctx.scale(scaleFactor, scaleFactor);
     },

     removeHotspots(imageData, q) {
       let grayscaleData = imageData.data;

       if (this.hotspotRemovalQuantile < 1) {
         for (let i = 0; i < grayscaleData.length; i += 4) {
           let value = 255;
           if (grayscaleData[i] < q)
             value = Math.floor(grayscaleData[i] * 255 / q);

           // set r,g,b channels
           grayscaleData[i] = value;
           grayscaleData[i + 1] = value;
           grayscaleData[i + 2] = value;
         }
       }

       this.grayscaleData = grayscaleData;
     },

     redraw () {
       this.isLoading = false;
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d"),
           parentWidth = Math.max(this.$refs.parent.offsetWidth, 750);

       ctx.setTransform(1, 0, 0, 1, 0, 0);

       const q = this.computeQuantile();
       this.scaleToViewport();

       //ctx.webkitImageSmoothingEnabled = false;
       //ctx.mozImageSmoothingEnabled = false;
       ctx.msImageSmoothingEnabled = false;
       ctx.imageSmoothingEnabled = false;
       ctx.drawImage(this.image, 0, 0);
       let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
       this.removeHotspots(imageData, q);
       ctx.putImageData(imageData, 0, 0);

       this.applyColormap();
     },

     applyColormap() {
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
       this.dataURI = canvas.toDataURL('image/png');
     },

     onFail () {
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d");
       canvas.width = canvas.height = 0;
       ctx.clearRect(0, 0, canvas.width, canvas.height);
       this.isLoading = false;
       this.dataURI = '';
     }
   }
 }
</script>
