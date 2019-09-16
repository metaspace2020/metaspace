<template>
  <div class="image-loader"
       v-loading="isLoading"
       ref="imageLoader"
       :element-loading-text="message"
       :style="{width:width+'px', height:height+'px'}"
       @wheel="onWheel"
       @mousedown.left.prevent="onMouseDown"
       @mousemove="onMouseOverIonImage"
       @mouseleave="onMouseLeaveIonImage">

    <div :style="viewBoxStyle">
      <img v-if="ionImage"
           :src="ionImageDataUri"
           class="isotope-image"
           :style="ionImageStyle"
      />

      <!--
       The key for the currently loaded image can shift between the following two img virtual-DOM nodes, which causes
       Vue to transfer the real DOM node from one virtual-DOM node to the other. This allows the following code to
       seamlessly switch between zoom levels that have different images and different transforms.
       Always test against IE11 when touching this code - IE11's @load event doesn't always fire on img elements.
      -->
      <img v-if="ionImage && opticalImageUrl"
           :key="loadedOpticalImageUrl"
           :src="loadedOpticalImageUrl"
           class="optical-image"
           :style="loadedOpticalImageStyle" />

      <img v-if="ionImage && opticalImageUrl && loadedOpticalImageUrl !== opticalImageUrl"
           :key="opticalImageUrl"
           :src="opticalImageUrl"
           class="optical-image optical-image-loading"
           :style="opticalImageStyle"
           @load="onOpticalImageLoaded"
      />
    </div>

    <div >
      <el-tooltip
        v-if="pixelIntensityStyle"
        :manual="true"
        :value="true"
        ref="pixelIntensityTooltip"
        :content="cursorOverPixelIntensity.toExponential(2)"
        popper-class="pointer-events-none"
        placement="top"
      >
        <div :style="pixelIntensityStyle" class="pixel-intensity" />
      </el-tooltip>
    </div>

    <scale-bar v-if="scaleBarColor"
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
 import {throttle} from 'lodash-es';


 const formatMatrix3d = t =>
   `matrix3d(${t[0][0]}, ${t[1][0]}, 0, ${t[2][0]},
             ${t[0][1]}, ${t[1][1]}, 0, ${t[2][1]},
                      0,          0, 1,          0,
             ${t[0][2]}, ${t[1][2]}, 0, ${t[2][2]})`;

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
     ionImageTransform: {
       // 3x3 matrix mapping ion-image pixel coordinates into new ion-image pixel coordinates independent from
       // zoom/offset props, e.g. This ionImageTransform:
       // [[1, 0, 5],
       //  [0, 1, 3],
       //  [0, 0, 1]]
       // will mean that the pixel in the viewer that previously showed ion image pixel (10, 10) will now show
       // pixel (5, 7) because the ion image has moved (+5, +3) from its original position.
       type: Array,
     },
     opticalTransform: {
       type: Array,
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
     pixelAspectRatio: {
       type: Number,
       default: 1
     },
     scaleBarColor: {
       type: String,
       default: null
     },
     showPixelIntensity: {
       type: Boolean,
       default: false
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
       overlayDefault: true,
       overlayFadingIn: false,
       tmId: 0,
       // Cache the last loaded optical image so that it doesn't flicker when changing zoom levels
       loadedOpticalImageUrl: this.opticalImageUrl,
       loadedOpticalImageStyle: this.opticalImageStyle,
       cursorPixelPos: null,
     }
   },
   watch: {
     pixelIntensityStyle() {
       this.$nextTick(this.updatePixelIntensity)
     }
   },
   created() {
     this.updatePixelIntensity = throttle(this.updatePixelIntensity);
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
         return this.pixelSizeY / this.zoom * this.pixelAspectRatio;
       }
     },

     zoomX() {
       return this.zoom;
     },

     zoomY() {
       return this.zoom / this.pixelAspectRatio;
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

     viewBoxStyle() {
       if (!this.isLCMS) {
         const ionImageWidth = (this.ionImage != null ? this.ionImage.width : this.width);
         const ionImageHeight = (this.ionImage != null ? this.ionImage.height : this.height);
         const x = this.width / 2 + (this.xOffset - ionImageWidth / 2) * this.zoomX;
         const y = this.height / 2 + (this.yOffset - ionImageHeight / 2) * this.zoomY;
         return {
           left: 0,
           top: 0,
           transformOrigin: '0 0',
           transform: `translate(${x}px, ${y}px) scale(${this.zoomX}, ${this.zoomY})`,
         };
       } else {
         // LC-MS data (1 x number of time points)
         return {
           width: this.width + 'px',
           height: this.height + 'px'
         };
       }

     },

     ionImageStyle() {
       return {
         transform: (this.ionImageTransform ? formatMatrix3d(this.ionImageTransform) : ''),
       };
     },

     opticalImageStyle() {
       return {
         transform: (this.opticalTransform ? formatMatrix3d(this.opticalTransform) : ''),
       };
     },

     opticalImageUrl() {
       return this.opticalSrc ? (config.imageStorage || '') + this.opticalSrc : null;
     },

     cursorOverPixelIntensity() {
       if (this.ionImage != null && this.cursorPixelPos != null) {
         const [x, y] = this.cursorPixelPos;
         const {width, height, mask, intensityValues} = this.ionImage
         if (x >= 0 && x < width
           && y >= 0 && y < height
           && mask[y * width + x] !== 0) {
           return intensityValues[y * width + x];
         } else {
           return null;
         }
       }
     },

     pixelIntensityStyle() {
       if (this.showPixelIntensity
         && this.ionImage != null
         && this.cursorPixelPos != null
         && this.cursorOverPixelIntensity != null) {

         const baseX = this.width / 2 + (this.xOffset - this.ionImage.width / 2) * this.zoomX;
         const baseY = this.height / 2 + (this.yOffset - this.ionImage.height / 2) * this.zoomY;
         const [cursorX, cursorY] = this.cursorPixelPos;
         return {
           left: (baseX + cursorX * this.zoomX - 0.5) + 'px',
           top: (baseY + cursorY * this.zoomY - 0.5) + 'px',
           width: `${this.zoomX - 0.5}px`,
           height: `${this.zoomY - 0.5}px`,
         }
       } else {
         return null;
       }
     }

   },
   methods: {

     onWheel(event) {
       // TODO: add pinch event handler for mobile devices
       if (event.ctrlKey || event.metaKey) {
         event.preventDefault();
         const sY = scrollDistance(event);

         const newZoomX = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom - this.zoom * sY / 10.0));
         const newZoomY = newZoomX / this.pixelAspectRatio;
         const rect = this.$refs.imageLoader.getBoundingClientRect();

         // Adjust the offsets so that the pixel under the mouse stays still while the image expands around it
         const mouseXOffset = (event.clientX - (rect.left + rect.right) / 2) / this.zoomX;
         const mouseYOffset = (event.clientY - (rect.top + rect.bottom) / 2) / this.zoomY;
         const xOffset = this.xOffset + mouseXOffset * (this.zoomX / newZoomX - 1);
         const yOffset = this.yOffset + mouseYOffset * (this.zoomY / newZoomY - 1);

         this.$emit('move', {zoom: newZoomX, xOffset, yOffset});

         this.$nextTick(() => {
           this.movePixelIntensity(event);
         });
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
       const xOffset = this.dragXOffset + (event.clientX - this.dragStartX) / this.zoomX;
       const yOffset = this.dragYOffset + (event.clientY - this.dragStartY) / this.zoomY;
       this.$emit('move', {zoom: this.zoom, xOffset, yOffset});
       document.removeEventListener('mouseup', this.onMouseUp);
       document.removeEventListener('mousemove', this.onMouseMove);
       this.dragStartX = this.dragStartY = null;
     },

     onMouseMove(event) {
       if (this.dragStartX === null) {
         return;
       }

       const xOffset = this.dragXOffset + (event.clientX - this.dragStartX) / this.zoomX;
       const yOffset = this.dragYOffset + (event.clientY - this.dragStartY) / this.zoomY;
       this.$emit('move', {zoom: this.zoom, xOffset, yOffset});
     },

     onOpticalImageLoaded() {
       this.loadedOpticalImageUrl = this.opticalImageUrl;
       this.loadedOpticalImageStyle = this.opticalImageStyle;
     },

     onMouseOverIonImage(event) {
       this.movePixelIntensity(event);
     },

     onMouseLeaveIonImage() {
       this.cursorPixelPos = null;
     },

     updatePixelIntensity() {
       // WORKAROUND: el-tooltip and el-popover don't correctly open if they're mounted in an already-visible state
       // Calling updatePopper
       if (this.$refs.pixelIntensityTooltip != null) {
         this.$refs.pixelIntensityTooltip.updatePopper();
       }
     },

     movePixelIntensity(event) {
       const rect = this.$refs.imageLoader.getBoundingClientRect();
       if (this.ionImage != null) {
         const { width = 0, height = 0 } = this.ionImage;
         // Includes a 2px offset up and left so that the selected pixel is less obscured by the mouse cursor
         const x = Math.floor((event.clientX - (rect.left + rect.right) / 2 - 2) / this.zoomX - this.xOffset + width / 2);
         const y = Math.floor((event.clientY - (rect.top + rect.bottom) / 2 - 2) / this.zoomY - this.yOffset + height / 2);

         this.cursorPixelPos = [x, y];
       } else {
         this.cursorPixelPos = null;
       }
     }
   }
 }
</script>

<style lang="scss" scoped>
 /* No attribute exists for MS Edge at the moment, so ion images are antialiased there */
 .isotope-image {
   position: absolute;
   z-index: 1;
   left: 0;
   top: 0;
   transform-origin: 0 0;
   image-rendering: pixelated;
   image-rendering: -moz-crisp-edges;
   -ms-interpolation-mode: nearest-neighbor;
   user-select: none;
 }

 .optical-image {
   position: absolute;
   z-index: -1;
   left: 0;
   top: 0;
   transform-origin: 0 0;
 }

 .optical-image-loading {
   opacity: 0.01;
   z-index: -2;
 }

 .image-loader {
   position: relative;
   overflow: hidden;
 }

 .image-loader__overlay-text {
   font-size: 24px;
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

  .pixel-intensity {
    position: absolute;
    border: 1px solid red;
    display: block;
    z-index: 3;
    pointer-events: none;
  }
</style>
<style>
  /* Unscoped, because the tooltip is appended to document.body */
  .pointer-events-none {
    pointer-events: none;
  }
</style>
