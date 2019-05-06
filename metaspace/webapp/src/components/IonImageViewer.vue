<template>
  <div class="image-loader"
       v-loading="isLoading"
       :element-loading-text="message"
       :style="{width:width+'px', height:height+'px'}"
       @wheel="onWheel"
       @mousedown.left.prevent="onMouseDown">

    <img v-if="ionImage"
         :src="ionImageDataUri"
         class="isotope-image"
         :style="imageStyle"/>

    <img v-if="ionImage && opticalSrc"
         :src="opticalImageUrl"
         class="optical-image"
         :style="opticalImageStyle" />

    <scale-bar v-if="!disableScaleBar"
               :xScale="xScale"
               :yScale="yScale"
               :scaleBarColor="scaleBarColor" />

    <div ref="mapOverlap"
         :class="{'image-loader__overlay': overlayDefault, 'image-loader__overlay--visible': overlayFadingIn}"
         v-show="scrollBlock">
      <p class="image-loader__overlay-text">Use {{messageOS}} to zoom the image</p>
    </div>
  </div>
</template>

<script>
 // uses loading directive from Element-UI

 import {scrollDistance, getOS} from '../util';
 import createColormap from '../lib/createColormap';
 import resize from 'vue-resize-directive';
 import config from '../config';
 import {renderIonImage} from '../lib/ionImageRendering';
 import ScaleBar from './ScaleBar.vue';


 export default {
   directives: {
     resize
   },
   components: {
     ScaleBar,
   },
   props: {
     ionImage: Object,
     isLoading: Boolean,
     // width & height of HTML element
     width: {type: Number, required: true},
     height: {type: Number, required: true},
     // zoom factor where 1.0 means 1 ion image pixel per browser pixel
     zoom: {type: Number, required: true},
     minZoom: {type: Number, default: 0.1},
     maxZoom: {type: Number, default: 10},
     // x & y coordinates to offset the center of the image in ion image pixel units. As long as these remain constant
     // the ion image pixel at the center will stay in the same place regardless of zoom level.
     // xOffset=0, yOffset=0 will center the ion image.
     xOffset: {type: Number, required: true},
     yOffset: {type: Number, required: true},
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
     opacityMode: {
       type: String,
       default: 'constant'
     },
     transform: {
       type: String,
       default: ''
     },
     scrollBlock: {
       type: Boolean,
       default: false
     },
     pixelSizeX: {
       type: Number,
       default: 0
     },
     pixelSizeY: {
       type: Number,
       default: 0
     },
     disableScaleBar: {
       type: Boolean,
       default: false
     },
     scaleBarColor: {
       type: String,
       default: '#000000'
     }
   },
   data () {
     return {
       message: '',
       dataURI: '',
       isLCMS: false,

       dragStartX: null,
       dragStartY: null,
       dragXOffset: 0, // starting position
       dragYOffset: 0,
       dragThrottled: false,
       overlayDefault: true,
       overlayFadingIn: false,
       tmId: 0
     }
   },
   computed: {
     isIE() {
       if (window.navigator.userAgent.indexOf('MSIE') > 0 ||
       window.navigator.userAgent.indexOf('Trident/') > 0) {
         return true
       }
       return false
     },


     xScale() {
       if (this.ionImage != null && this.pixelSizeX != null && this.pixelSizeX !== 0) {
         return this.pixelSizeX / this.zoom;
       }
     },

     yScale() {
       if (this.ionImage != null && this.pixelSizeY != null && this.pixelSizeY !== 0) {
         return this.pixelSizeY / this.zoom;
       }
     },

     cmap() {
       return createColormap(this.colormap, this.opacityMode, this.annotImageOpacity);
     },

     ionImageDataUri() {
       return this.ionImage && renderIonImage(this.ionImage, this.cmap);
     },

     messageOS() {
       let os = getOS();

       if (os === 'Linux' || os === 'Windows') {
         return 'CTRL + scroll the mouse wheel'
       } else if (os === 'Mac OS') {
         return 'CMD ⌘ + scroll the mouse wheel'
       } else if (os === 'Android' || os === 'iOS') {
         return 'two fingers'
       } else {
         return 'CTRL + scroll wheel'
       }
     },

     imageStyle() {
       // assume the allocated screen space has width > height
       if (!this.ionImage) {
         const width = this.width * this.zoom;
         const height = this.height * this.zoom;
         const x = this.width / 2 + (this.xOffset - this.width / 2) * this.zoom;
         const y = this.height / 2 + (this.yOffset - this.height / 2) * this.zoom;
         return {
           'width': width + 'px',
           'height': height + 'px',
           left: x + 'px',
           top: y + 'px',
           transform: this.transform,
           'transform-origin': '0 0',
         };
       } else if (!this.isLCMS) {
         const width = this.ionImage.width * this.zoom;
         const height = this.ionImage.height * this.zoom;
         const x = this.width / 2 + (this.xOffset - this.ionImage.width / 2) * this.zoom;
         const y = this.height / 2 + (this.yOffset - this.ionImage.height / 2) * this.zoom;

         return {
           'width': width + 'px',
           'height': height + 'px',
           left: x + 'px',
           top: y + 'px',
           transform: this.transform,
           'transform-origin': '0 0',
         };
       } else {
         // LC-MS data (1 x number of time points)
         return {
           width: this.width + 'px',
           height: this.height + 'px'
         };
       }
     },

     opticalImageStyle() {
       const style = this.imageStyle;
       return Object.assign({}, style, {
         //'opacity': 1.0 - style.opacity,
         'vertical-align': 'top'
       });
     },

     opticalImageUrl() {
       return (config.imageStorage || '') + this.opticalSrc;
     },

   },
   methods: {

     onWheel(event) {
       // TODO: add pinch event handler for mobile devices
       if (event.ctrlKey || event.metaKey) {
         event.preventDefault();
         const sY = scrollDistance(event);

         const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom - this.zoom * sY / 10.0));
         const rect = event.target.getBoundingClientRect();

         // Adjust the offsets so that the pixel under the mouse stays still while the image expands around it
         const mouseXOffset = (event.clientX - (rect.left + rect.right) / 2) / this.zoom;
         const mouseYOffset = (event.clientY - (rect.top + rect.bottom) / 2) / this.zoom;
         const xOffset = this.xOffset * (this.zoom / newZoom) + mouseXOffset * (this.zoom / newZoom - 1);
         const yOffset = this.yOffset * (this.zoom / newZoom) + mouseYOffset * (this.zoom / newZoom - 1);

         this.$emit('move', {zoom: newZoom, xOffset, yOffset});
       }
       else if (event.deltaY) {
         this.overlayFadingIn = true;
         if (this.tmId !== 0) {
           clearTimeout(this.tmId)
         }
         this.tmId = setTimeout(() => {
           this.overlayFadingIn = false;
         }, 1100);
       }
     },

     onMouseDown(event) {
       this.dragStartX = event.clientX;
       this.dragStartY = event.clientY;
       this.dragXOffset = this.xOffset;
       this.dragYOffset = this.yOffset;
       document.addEventListener('mouseup', this.onMouseUp);
       document.addEventListener('mousemove', this.onMouseMove);
     },

     onMouseUp(event) {
       this.dragThrottled = false;
       const xOffset = this.dragXOffset + (event.clientX - this.dragStartX) / this.zoom;
       const yOffset = this.dragYOffset + (event.clientY - this.dragStartY) / this.zoom;
       this.$emit('move', {zoom: this.zoom, xOffset, yOffset});
       document.removeEventListener('mouseup', this.onMouseUp);
       document.removeEventListener('mousemove', this.onMouseMove);
       this.dragStartX = this.dragStartY = null;
     },

     onMouseMove(event) {
       if (this.dragStartX === null || this.dragThrottled) {
         return;
       }

       this.dragThrottled = true;
       if(window.requestAnimationFrame) {
         requestAnimationFrame(() => { this.dragThrottled = false; });
       } else {
         setTimeout(() => { this.dragThrottled = false; }, 40);
       }

       const xOffset = this.dragXOffset + (event.clientX - this.dragStartX) / this.zoom;
       const yOffset = this.dragYOffset + (event.clientY - this.dragStartY) / this.zoom;
       this.$emit('move', {zoom: this.zoom, xOffset, yOffset});
     }
   }
 }
</script>

<style lang="scss" scoped>
 /* No attribute exists for MS Edge at the moment, so ion images are antialiased there */
 .isotope-image {
   position: absolute;
   z-index: 2;
   image-rendering: pixelated;
   image-rendering: -moz-crisp-edges;
   -ms-interpolation-mode: nearest-neighbor;
   user-select: none;
 }

 .optical-image {
   position: absolute;
   z-index: 1;
 }

 .image-loader {
   position: relative;
   overflow: hidden;
 }

 .image-loader__overlay-text {
   font: 24px 'Roboto', sans-serif;
   display: block;
   position: relative;
   text-align: center;
   top: 50%;
   transform: translateY(-50%);
   z-index: 4;
   color: #fff;
   padding: auto;
 }

 .image-loader__overlay {
   pointer-events: none;
   background-color: #fff;
   width: 100%;
   height: 100%;
   position: absolute;
   opacity: 0;
   transition: 1.1s;
   z-index: 3;
 }

 .image-loader__overlay--visible {
   background-color: black;
   opacity: 0.6;
   transition: 0.7s;
 }
</style>
