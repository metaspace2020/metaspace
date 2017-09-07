<template>
  <div class="image-loader"
       v-loading="isLoading"
       ref="parent"
       :element-loading-text="message">
    <div>
      <img :src="dataURI" :style="imageStyle" v-on:click="onClick" ref="visibleImage"
          class="isotope-image"/>
    </div>

    <div>
      <img v-if="opticalSrc"
          :src="opticalSrc" class="optical-image" :style="opticalImageStyle" />
    </div>

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
     },
     opticalSrc: {
       type: String,
       default: null
     },
     opticalImageOpacity: {
       type: Number,
       default: 0.5
     }
   },
   data () {
     return {
       image: new Image(),
       isLoading: false,
       message: '',
       dataURI: '',
       hotspotRemovalQuantile: 0.99,
       isLCMS: false,
       scaleFactor: 1,
       visibleImageHeight: 0,
     }
   },
   created() {
     this.colors = createColormap(this.colormap);
     this.image.onload = this.redraw.bind(this);
     this.image.onerror = this.image.onabort = this.onFail.bind(this);
     if (this.src)
       this.loadImage(this.src);
   },
   computed: {
     imageStyle() {
       // assume the allocated screen space has width > height
       if (!this.isLCMS) {
         if (this.scaleFactor <= 1)
           return {
             width: '100%',                       // maximize width
             'max-height': this.maxHeight + 'px', // limit height
             'object-fit': 'contain'              // keep aspect ratio
           };
         else
           return {
             'width': this.image.naturalWidth * this.scaleFactor + 'px',
             'height': this.image.naturalHeight * this.scaleFactor + 'px'
           };
       } else // LC-MS data (1 x number of time points)
         return {
           width: '100%',
           height: Math.min(100, this.maxHeight) + 'px',
         };
     },

     opticalImageStyle() {
       const style = this.imageStyle;
       return Object.assign({}, style, {
         'margin-top': (-this.visibleImageHeight) + 'px',
         'vertical-align': 'top',
         'opacity': this.opticalImageOpacity
       });
     }
   },
   watch: {
     'src' (url) {
       this.loadImage(url);
     },
     'colormap' (name) {
       this.colors = createColormap(name);
       this.applyColormap();
     }
   },
   methods: {
     loadImage(url) {
       this.image.crossOrigin = "Anonymous";
       this.image.src = url;
       this.isLoading = true;
     },

     computeQuantile () {
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d");

       let data = [],
           imageData = ctx.getImageData(0, 0, canvas.width, canvas.height),
           grayscaleData = imageData.data;

       for (let i = 0; i < grayscaleData.length; i += 4)
         if (grayscaleData[i] > 0)
           data.push(grayscaleData[i])

       if (data.length > 0)
         return quantile(data, this.hotspotRemovalQuantile);
       else
         return 0;
     },

     determineScaleFactor() {
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d"),
           parentWidth = this.$refs.parent.offsetWidth;
       // scale up small images to use as much canvas as possible
       const scale1 = parentWidth / this.image.naturalWidth,
             scale2 = this.maxHeight / this.image.naturalHeight,
             scaleFactor = Math.min(scale1, scale2);
       this.scaleFactor = scaleFactor;
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
       this.isLCMS = this.image.height == 1;
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d");

       this.determineScaleFactor();
       ctx.canvas.height = this.image.naturalHeight;
       ctx.canvas.width = this.image.naturalWidth;
       ctx.setTransform(1, 0, 0, 1, 0, 0);

       ctx.drawImage(this.image, 0, 0);
       const q = this.computeQuantile();

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

       this.$refs.visibleImage.onload = () => {
         this.visibleImageHeight = this.$refs.visibleImage.height;
         this.$emit('redraw', {
           width: this.$refs.visibleImage.width,
           height: this.$refs.visibleImage.height,
           scaleFactor: this.scaleFactor
         });
       }

       this.dataURI = canvas.toDataURL('image/png');
     },

     onFail () {
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d");
       canvas.width = canvas.height = 0;
       ctx.clearRect(0, 0, canvas.width, canvas.height);
       this.isLoading = false;
       this.dataURI = '';
     },

     onClick (event) {
       const rect = event.target.getBoundingClientRect();
       this.$emit('click', {
         x: Math.floor((event.clientX - rect.left) / this.scaleFactor),
         y: Math.floor((event.clientY - rect.top) / this.scaleFactor)
       });
     },

     getImage() {
       return this.image;
     },

     getScaleFactor() {
       return this.scaleFactor;
     }
   }
 }
</script>

<style>
 .isotope-image {
   image-rendering: pixelated;
   image-rendering: -moz-crisp-edges;
 }

 .image-loader {
   width: 100%;
   line-height: 0px;
   display: flex;
   flex-direction: column;
   align-self: center;
 }
</style>
