<template>
  <div class="image-loader"
       v-loading="isLoading"
       ref="parent"
       v-resize.debounce.50="onResize"
       :element-loading-text="message">

    <div :style="imageContainerStyle" class="image-loader__container"
         ref="container">
      <div style="text-align: left; z-index: 2; position: relative">
        <img :src="dataURI" :style="imageStyle" v-on:click="onClick" ref="visibleImage"
             class="isotope-image"/>
      </div>

      <div style="text-align: left; z-index: 1; position: relative">
        <img v-if="opticalSrc"
             :src="opticalImageUrl"
             class="optical-image"
             :style="opticalImageStyle" />
      </div>
    </div>

    <canvas ref="canvas" style="display:none;"></canvas>
  </div>
</template>

<script>
 // uses loading directive from Element-UI

 import {createColormap, scrollDistance} from '../util';
 import {quantile} from 'simple-statistics';
 import resize from 'vue-resize-directive';
 import config from '../clientConfig.json';

 const OPACITY_MAPPINGS = {
   'constant': (x) => 1,
   'linear': (x) => x,
   'quadratic': (x) => 1 - (1-x)*(1-x)
 };

 export default {
   directives: {
     resize
   },
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
     annotImageOpacity: {
       type: Number,
       default: 0.5
     },
     zoom: {
       type: Number,
       default: 1
     },
     xOffset: { // in natural IMS image pixels
       type: Number,
       default: 0
     },
     yOffset: {
       type: Number,
       default: 0
     },
     opacityMode: {
       type: String,
       default: 'constant'
     },
     transform: {
       type: String,
       default: ''
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

       visibleImageHeight: 0, // in CSS pixels
       visibleImageWidth: 0,
       parentDivWidth: 0,
       imageWidth: 0,
       imageHeight: 0,

       dragStartX: 0,
       dragStartY: 0,
       dragXOffset: 0, // starting position
       dragYOffset: 0,
       dragThrottled: false
     }
   },
   created() {
     this.colors = createColormap(this.colormap);
     this.image.onload = this.redraw.bind(this);
     this.image.onerror = this.image.onabort = this.onFail.bind(this);
     if (this.src)
       this.loadImage(this.src);
   },
   mounted: function() {
     this.parentDivWidth = this.$refs.parent.clientWidth;
     this.$refs.visibleImage.addEventListener('mousedown', this.onMouseDown);
     this.$refs.visibleImage.addEventListener('wheel', this.onWheel);
     window.addEventListener('resize', this.onResize);
   },
   beforeDestroy: function() {
     window.removeEventListener('resize', this.onResize);
   },
   computed: {
     imageStyle() {
       // assume the allocated screen space has width > height
       if (!this.isLCMS) {
         const width = this.imageWidth,
               height = this.imageHeight,
               dx = this.xOffset * this.scaleFactor * this.zoom,
               dy = this.yOffset * this.scaleFactor * this.zoom,
               transform = `scale(${this.zoom}, ${this.zoom})` +
                           `translate(${-dx / this.zoom}px, ${-dy / this.zoom}px)`,
               clipPathOffsets = [dy, (width * (this.zoom - 1) - dx), (height * (this.zoom - 1) - dy), dx];

         let clipPath = null;
         if (dx != 0 || dy != 0 || this.zoom != 1)
           clipPath = 'inset(' + clipPathOffsets.map(x => x / this.zoom + 'px').join(' ') + ')';

         return {
           'width': width + 'px',
           'height': height + 'px',
           transform: transform + ' ' + this.transform,
           'transform-origin': '0 0',
           clipPath,
           //opacity: this.annotImageOpacity
         };
       } else // LC-MS data (1 x number of time points)
       return {
         width: '100%',
         height: Math.min(100, this.maxHeight) + 'px'
       };
     },

     imageContainerStyle() {
       return {
         width: this.imageWidth + 'px',
         'align-self': 'center'
       }
     },

     opticalImageStyle() {
       const style = this.imageStyle;
       return Object.assign({}, style, {
         //'opacity': 1.0 - style.opacity,
         'margin-top': (-this.visibleImageHeight) + 'px',
         'vertical-align': 'top'
       });
     },

     opticalImageUrl() {
       return (config.imageStorage || '') + this.opticalSrc;
     }
   },
   watch: {
     'src' (url) {
       this.loadImage(url);
     },
     'colormap' (name) {
       this.colors = createColormap(name);
       this.applyColormap();
     },
     'annotImageOpacity' (opacity) {
       this.applyColormap();
     },
     'opticalSrc' (url) {
       this.applyColormap();
     }
   },
   methods: {
     onResize() {
       this.parentDivWidth = this.$refs.parent.clientWidth;
       this.determineScaleFactor();
       this.$nextTick(() => {
         this.updateDimensions();
       });
     },

     onWheel(event) {
       event.preventDefault();
       const sY = scrollDistance(event);

       const newZoom = Math.max(1, this.zoom - sY / 10.0);
       const rect = event.target.getBoundingClientRect(),
             x = (event.clientX - rect.left) / this.scaleFactor / this.zoom,
             y = (event.clientY - rect.top) / this.scaleFactor / this.zoom,
             xOffset = -(this.zoom / newZoom - 1) * x + this.zoom / newZoom * this.xOffset,
             yOffset = -(this.zoom / newZoom - 1) * y + this.zoom / newZoom * this.yOffset;

       this.$emit('zoom', {zoom: newZoom});
       this.$emit('move', {xOffset, yOffset});
     },

     onMouseDown(event) {
       event.preventDefault();
       this.dragStartX = event.clientX;
       this.dragStartY = event.clientY;
       this.dragXOffset = this.xOffset;
       this.dragYOffset = this.yOffset;
       document.addEventListener('mouseup', this.onMouseUp);
       document.addEventListener('mousemove', this.onMouseMove);
     },

     onMouseUp(event) {
       this.dragThrottled = false;
       const xOffset = this.dragXOffset - (event.clientX - this.dragStartX) / this.scaleFactor / this.zoom,
             yOffset = this.dragYOffset - (event.clientY - this.dragStartY) / this.scaleFactor / this.zoom;
       this.$emit('move', {xOffset: this.xOffset, yOffset: this.yOffset});
       document.removeEventListener('mouseup', this.onMouseUp);
       document.removeEventListener('mousemove', this.onMouseMove);
       this.dragStartX = this.dragStartY = null;
     },

     onMouseMove(event) {
       if (this.dragStartX === null || this.dragThrottled)
         return;

       this.dragThrottled = true;
       setTimeout(() => { this.dragThrottled = false; }, 40);

       const xOffset = this.dragXOffset - (event.clientX - this.dragStartX) / this.scaleFactor / this.zoom,
             yOffset = this.dragYOffset - (event.clientY - this.dragStartY) / this.scaleFactor / this.zoom;
       this.$emit('move', {xOffset, yOffset});
     },

     loadImage(url) {
       this.image.crossOrigin = "Anonymous";
       this.image.src = (config.imageStorage || '') + url;

       if (window.navigator.userAgent.includes("Trident"))
         return; // in IE11 something is fucked up as usual

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
       // scale up small images to use as much canvas as possible
       const scale1 = this.parentDivWidth / this.image.naturalWidth,
             scale2 = this.maxHeight / this.image.naturalHeight,
             scaleFactor = Math.min(scale1, scale2);
       this.scaleFactor = scaleFactor;
       this.imageWidth = this.image.naturalWidth * this.scaleFactor;
       this.imageHeight = this.image.naturalHeight * this.scaleFactor;
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
       this.isLCMS = this.image.height == 1;
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d");

       this.determineScaleFactor();
       this.updateDimensions();
       ctx.canvas.height = this.image.naturalHeight;
       ctx.canvas.width = this.image.naturalWidth;
       ctx.setTransform(1, 0, 0, 1, 0, 0);

       ctx.drawImage(this.image, 0, 0);
       const q = this.computeQuantile();

       ctx.drawImage(this.image, 0, 0);
       if (canvas.width == 0)
         return;
       let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
       this.removeHotspots(imageData, q);
       ctx.putImageData(imageData, 0, 0);
       this.applyColormap();

       this.isLoading = false;
     },

     applyColormap() {
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d");

       var g = this.grayscaleData;
       if (g === undefined || canvas.width == 0)
         return;

       var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
       var pixels = imageData.data;
       var numPixels = pixels.length / 4;

       // TODO experiment with different functions
       const f = OPACITY_MAPPINGS[this.opacityMode];

       for (let i = 0; i < numPixels; i++) {
         let c = this.colors[g[i*4]];
         pixels[i*4] = c[0];
         pixels[i*4+1] = c[1];
         pixels[i*4+2] = c[2];
         pixels[i*4+3] = g[i*4+3] == 0 ? 0 : this.annotImageOpacity * 255 * f(g[i*4] / 255);
       }

       ctx.clearRect(0, 0, canvas.width, canvas.height);
       ctx.putImageData(imageData, 0, 0);

       this.dataURI = canvas.toDataURL('image/png');
     },

     updateDimensions() {
       // FIXME: this logic should be in AnnotationView (?)
       const oldHeight = this.visibleImageHeight,
             oldWidth = this.visibleImageWidth;
       if (oldHeight == this.$refs.visibleImage.height &&
           oldWidth == this.$refs.visibleImage.width)
         return;

       this.$emit('zoom', {zoom: 1});
       this.$emit('move', {xOffset: 0, yOffset: 0});

       this.visibleImageHeight = this.$refs.visibleImage.height;
       this.visibleImageWidth = this.$refs.visibleImage.width;
       this.$emit('redraw', {
         width: this.$refs.visibleImage.width,
         height: this.$refs.visibleImage.height,
         scaleFactor: this.scaleFactor
       });
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
     },

     getContainer() {
       return this.$refs.container;
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
