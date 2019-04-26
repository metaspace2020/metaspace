<template>
  <div class="image-loader"
       v-loading="isLoading"
       ref="parent"
       v-resize="onResize"
       :element-loading-text="message">

    <div class="image-loader__container" ref="container" style="align-self: center">
      <div style="text-align: left; z-index: 2; position: relative;">
        <img :src="ionImageDataUri"
             :style="imageStyle"
             @click="onClick"
             @wheel="onWheel"
             @mousedown.left.prevent="onMouseDown"
             ref="visibleImage"
             class="isotope-image"/>
      </div>

      <div style="text-align: left; z-index: 1; position: relative">
        <img v-if="opticalSrc"
             :src="opticalImageUrl"
             class="optical-image"
             :style="opticalImageStyle" />
      </div>
      <div :style="cssProps"
           :class="{pixelSizeX: pixelSizeIsActive}"
           v-if="pixelSizeIsActive && !disableScaleBar && !scaleBarOxExceeds">
        <div :class="{pixelSizeXText: pixelSizeIsActive}">{{scaleBarValX}}</div>
      </div>
      <div :style="cssProps"
           :class="{pixelSizeY: pixelSizeIsActive}"
           v-if="pixelSizeIsActive && !disableScaleBar && !scaleBarOyExceeds && this.pixelSizeX !== this.pixelSizeY">
        <div :class="{pixelSizeYText: pixelSizeIsActive}">{{scaleBarValY}}</div>
      </div>
    </div>

    <div ref="mapOverlap"
         :class="{'image-loader__overlay': overlayDefault, 'image-loader__overlay--visible': overlayFadingIn}"
         v-show="scrollBlock">
      <p class="image-loader__overlay-text">Use {{messageOS}} to zoom the image</p>
    </div>
    <canvas ref="canvas" style="display:none;"></canvas>
  </div>
</template>

<script>
 // uses loading directive from Element-UI

 import {scrollDistance, getOS} from '../util';
 import {throttle} from 'lodash-es';
 import createColormap from '../lib/createColormap';
 import resize from 'vue-resize-directive';
 import config from '../config';
 import {renderIonImage} from '../lib/ionImageRendering';


 export default {
   directives: {
     resize
   },
   props: {
     ionImage: {
       type: Object
     },
     isLoading: {

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
       isUnmounted: false,
       message: '',
       dataURI: '',
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
       dragThrottled: false,
       overlayDefault: true,
       overlayFadingIn: false,
       tmId: 0
     }
   },
   created() {
     this.onResize = throttle(this.onResize, 100);
   },
   mounted() {
     window.addEventListener('resize', this.onResize);
     this.updateImageDimensions();
   },
   beforeDestroy() {
     window.removeEventListener('resize', this.onResize);
     this.onResize.cancel(); // If there's a pending throttled call, cancel it
     this.isUnmounted = true;
   },
   computed: {
     isIE() {
       if (window.navigator.userAgent.indexOf('MSIE') > 0 ||
       window.navigator.userAgent.indexOf('Trident/') > 0) {
         return true
       }
       return false
     },

     scaleBarSizeBasis() {
       return 50
     },

     scaleBarValX() {
       return this.scaleBarAxisObj(this.pixelSizeX).scaleBarVal
     },

     scaleBarValY() {
       return this.scaleBarAxisObj(this.pixelSizeY).scaleBarVal
     },

     scaleBarOxExceeds() {
       return this.scaleBarAxisObj(this.pixelSizeX).axisExceeding
     },

     scaleBarOyExceeds() {
       return this.scaleBarAxisObj(this.pixelSizeY).axisExceeding
     },

     pixelSizeIsActive() {
       if (this.pixelSizeX !== 0 && this.pixelSizeY !== 0) {
         return true
       }
       return false
     },

     cmap() {
       return createColormap(this.colormap, this.opacityMode, this.annotImageOpacity);
     },

     ionImageDataUri() {
       if (this.ionImage != null) {
         return renderIonImage(this.ionImage, this.cmap);
       } else {
         return 'data:,';
       }
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
       if (!this.isLCMS) {
         const width = this.imageWidth,
               height = this.imageHeight,
               dx = this.xOffset * this.scaleFactor * this.zoom,
               dy = this.yOffset * this.scaleFactor * this.zoom,
               transform = `scale(${this.zoom}, ${this.zoom})` +
                   `translate(${-dx / this.zoom}px, ${-dy / this.zoom}px)`

         return {
           'width': width + 'px',
           'height': height + 'px',
           transform: transform + ' ' + this.transform,
           'transform-origin': '0 0'
         };
       } else // LC-MS data (1 x number of time points)
       return {
         width: '100%',
         height: Math.min(100, this.maxHeight) + 'px'
       };
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
     },

     cssProps() {
       if (this.isIE) {
         return null
       } else {
         return {
           '--scaleBar-color': this.scaleBarColor,
           '--scaleBarX-size': `${this.scaleBarAxisObj(this.pixelSizeX).scaleBarShownAxisVal}px`,
           '--scaleBarY-size': `${this.scaleBarAxisObj(this.pixelSizeY).scaleBarShownAxisVal}px`,
           '--addedValToOyBar': this.scaleBarAxisObj(this.pixelSizeY).scaleBarShownAxisVal,
           '--scaleBarTextWidth': Math.max(document.documentElement.clientWidth, window.innerWidth || 0) > 3000 ?
             `${100}px` : `${this.scaleBarAxisObj(this.pixelSizeX).scaleBarShownAxisVal}`
         }
       }
     },
   },
   watch: {
     ionImage() {
       this.$nextTick(() => {
         if (!this.isUnmounted) {
           this.updateImageDimensions();
         }
       })
     }
   },
   methods: {
     scaleBarAxisObj(pixelSizeAxis) {
       if (this.ionImage != null && this.pixelSizeIsActive && this.visibleImageWidth !== 0 && !this.isIE) {
         let notCeiledVal = (this.ionImage.width /
           (this.zoom * this.visibleImageWidth)) * this.scaleBarSizeBasis * pixelSizeAxis;
         const steps = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
         let ceiledVal= steps.find(step => notCeiledVal < step);
         if (ceiledVal == null) {
           ceiledVal = Math.ceil(Math.round(this.ionImage.width /
             (this.zoom * this.visibleImageWidth) * this.scaleBarSizeBasis * pixelSizeAxis) / 10) * 10;
         }
         let addedVal = (ceiledVal - notCeiledVal) / pixelSizeAxis *
           (this.zoom * this.visibleImageWidth) / this.ionImage.width;
         return {
           scaleBarShownAxisVal: this.scaleBarSizeBasis + addedVal,
           axisExceeding: Math.round(this.scaleBarSizeBasis + addedVal) > this.parentDivWidth,
           scaleBarVal: ceiledVal >= 1000 ? `${Math.round(ceiledVal/1000)} mm` : `${ceiledVal} µm`
         };
       }
       return {};
     },

     onResize: function() {
       if (!this.isUnmounted) {
         this.updateImageDimensions();
       }
     },

     onWheel(event) {
       // TODO: add pinch event handler for mobile devices
       if (event.ctrlKey || event.metaKey) {
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

     updateImageDimensions() {
       this.parentDivWidth = this.$refs.parent.clientWidth;
       this.visibleImageHeight = this.$refs.visibleImage.height;
       this.visibleImageWidth = this.$refs.visibleImage.width;
       console.log('updateImageDimensions', {
         parentDivWidth: this.$refs.parent.clientWidth,
         visibleImageHeight: this.$refs.visibleImage.height,
         visibleImageWidth: this.$refs.visibleImage.width,
         imageWidth: this.ionImage && this.ionImage.width * this.scaleFactor,
         imageHeight: this.ionImage && this.ionImage.height * this.scaleFactor,
       });
       // scale up small images to use as much canvas as possible
       if (this.ionImage != null) {
         const scale1 = this.parentDivWidth / this.ionImage.width;
         const scale2 = this.maxHeight / this.ionImage.height;
         this.scaleFactor = Math.min(scale1, scale2);
         this.imageWidth = this.ionImage.width * this.scaleFactor;
         this.imageHeight = this.ionImage.height * this.scaleFactor;

         this.$emit('redraw', {
           width: this.visibleImageWidth,
           height: this.visibleImageHeight,
           naturalWidth: this.ionImage.width,
           naturalHeight: this.ionImage.height,
         })
       }
     },

     onClick (event) {
       const rect = event.target.getBoundingClientRect();
       this.$emit('click', {
         x: Math.floor((event.clientX - rect.left) / this.scaleFactor),
         y: Math.floor((event.clientY - rect.top) / this.scaleFactor)
       });
     },

     getParent() {
       return this.$refs.parent;
     },

     getScaledImageSize() {
       return {
         'imgWidth': this.$refs.visibleImage.getBoundingClientRect().width,
         'imgHeight': this.$refs.visibleImage.getBoundingClientRect().height
       }
     }
   }
 }
</script>

<style lang="scss">
 /* No attribute exists for MS Edge at the moment, so ion images are antialiased there */
 .isotope-image {
   image-rendering: pixelated;
   image-rendering: -moz-crisp-edges;
   -ms-interpolation-mode: nearest-neighbor;
   user-select: none;
 }

 .image-loader {
   display: flex;
   flex-direction: column;
   align-content: center;
   justify-content: space-evenly;
   overflow: hidden;
   width: 100%;
   line-height: 0;
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

 .pixelSizeX {
   color: var(--scaleBar-color);
   position: absolute;
   font-weight: bold;
   width: var(--scaleBarX-size);
   bottom: 20px;
   left: 20px;
   border-bottom: 5px solid var(--scaleBar-color);
   z-index: 3;
 }

 .pixelSizeXText {
   position: absolute;
   width: var(--scaleBarTextWidth);
   bottom: 10px;
   left: 0;
   right: 0;
   text-align: center;
   z-index: 3;
 }

 .pixelSizeY {
   color: var(--scaleBar-color);
   position: absolute;
   font-weight: bold;
   height: var(--scaleBarY-size);
   bottom: 20px;
   left: 20px;
   border-left: 5px solid var(--scaleBar-color);
   z-index: 3;
 }

 .pixelSizeYText {
   position: absolute;
   content: "";
   width: 100px;
   bottom: var(--addedValToOyBar)px;
   top: 5px;
   left: 3px;
   right: 0;
   z-index: 3;
 }

 .color-picker {
   display: block;
   position: absolute;
   bottom: 35px;
   left: 30px;
   z-index: 4;
 }

 .el-form-item{
   margin-bottom: 10px;
 }

</style>
