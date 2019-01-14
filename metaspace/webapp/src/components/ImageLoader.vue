<template>
  <div class="image-loader"
       v-loading="isLoading"
       ref="parent"
       v-resize="onResize"
       :element-loading-text="message">

    <div class="image-loader__container" ref="container" style="align-self: center">
      <div style="text-align: left; z-index: 2; position: relative;">
        <img :src="dataURI"
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
           title="Click to change the color"
           @click="onClickScaleBar()"
           v-if="pixelSizeIsActive && showScaleBar && !scaleBarOxExceeds">
        <div :class="{pixelSizeXText: pixelSizeIsActive}">{{scaleBarValX}}</div>
      </div>
      <div :style="cssProps"
           :class="{pixelSizeY: pixelSizeIsActive}"
           title="Click to change the color"
           @click="onClickScaleBar()"
           v-if="pixelSizeIsActive && showScaleBar && !scaleBarOyExceeds && this.pixelSizeX !== this.pixelSizeY">
        <div :class="{pixelSizeYText: pixelSizeIsActive}">{{scaleBarValY}}</div>
      </div>
      <palette v-show="paletteIsVisible" class="color-picker" @colorInput="val=>updateColor(val)" />
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
 import {quantile} from 'simple-statistics';
 import resize from 'vue-resize-directive';
 import config from '../clientConfig.json';
 import Palette from './Palette.vue'

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
     showScaleBar: {
       type: Boolean,
       default: true
     }
   },
   data () {
     return {
       image: new Image(),
       colors: createColormap(this.colormap),
       isLoading: false,
       isUnmounted: false,
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
       dragThrottled: false,
       overlayDefault: true,
       overlayFadingIn: false,
       tmId: 0,
       scaleBarColor: '#000000',
       paletteIsVisible: false,
       scaleBarShadow: '#FFFFFF'
     }
   },
   components: {
     'palette': Palette
   },
   created() {
     this.onResize = throttle(this.onResize, 100);
   },
   mounted() {
     this.image.onload = this.redraw.bind(this);
     this.image.onerror = this.image.onabort = this.onFail.bind(this);
     if (this.src)
       this.loadImage(this.src);
     this.parentDivWidth = this.$refs.parent.clientWidth;
     window.addEventListener('resize', this.onResize);
     this.$el.addEventListener('click', this.paletteClickHandler);
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
           '--scaleBarShadow-color': this.scaleBarShadow,
           '--addedValToOyBar': this.scaleBarAxisObj(this.pixelSizeY).scaleBarShownAxisVal,
           '--scaleBarTextWidth': Math.max(document.documentElement.clientWidth, window.innerWidth || 0) > 3000 ?
             `${100}px` : `${this.scaleBarAxisObj(this.pixelSizeX).scaleBarShownAxisVal}`
         }
       }
     },
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
     scaleBarAxisObj(pixelSizeAxis) {
       if (this.pixelSizeIsActive && this.visibleImageWidth !== 0 && !this.isIE) {
         let notCeiledVal = (this.image.naturalWidth /
           (this.zoom * this.visibleImageWidth)) * this.scaleBarSizeBasis * pixelSizeAxis;
         const steps = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
         let ceiledVal= steps.find(step => notCeiledVal < step);
         if (ceiledVal == null) {
           ceiledVal = Math.ceil(Math.round(this.image.naturalWidth /
             (this.zoom * this.visibleImageWidth) * this.scaleBarSizeBasis * pixelSizeAxis) / 10) * 10;
         }
         let addedVal = (ceiledVal - notCeiledVal) / pixelSizeAxis *
           (this.zoom * this.visibleImageWidth) / this.image.naturalWidth;
         return {
           scaleBarShownAxisVal: this.scaleBarSizeBasis + addedVal,
           axisExceeding: Math.round(this.scaleBarSizeBasis + addedVal) > this.parentDivWidth,
           scaleBarVal: ceiledVal >= 1000 ? `${Math.round(ceiledVal/1000)} mm` : `${ceiledVal} µm`
         };
       }
       return {};
     },

     updateColor(val) {
       this.scaleBarColor = val;
       if(val === '#000000') {
         this.scaleBarShadow = '#FFFFFF';
       }
       else if (val === '#FFFFFF') {
         this.scaleBarShadow = '#000'
       }
       else if (val === '#999999') {
         this.scaleBarShadow = '#000000'
       }
       this.paletteIsVisible = false;
     },

     onClickScaleBar() {
       this.paletteIsVisible = true;
     },

     onResize: function() {
       // v-resize sometimes keeps calling after the component is destroyed - ignore it when it does.
       if (!this.isUnmounted) {
         this.parentDivWidth = this.$refs.parent.clientWidth;
         this.determineScaleFactor();
         this.$nextTick(() => {
           if (!this.isUnmounted) {
             this.updateDimensions();
           }
         });
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

     loadImage(url) {
       this.image.crossOrigin = "Anonymous";
       this.image.src = (config.imageStorage || '') + url;
       if (window.navigator.userAgent.includes("Trident")) {
         // IE11 never fires the events that would set isLoading=false.
         // It's probably this: https://stackoverflow.com/questions/16797786/image-load-event-on-ie
         // but this issue isn't big enough to justify the time cost and risk of destabilizing to try a solution.
         return;
       }

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
       const canvas = this.$refs.canvas;
       if (canvas != null) {
         const ctx = canvas.getContext("2d");

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
       }
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
   cursor: -webkit-grab;
   cursor: grab;
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

 .pixelSizeX:hover,
 .pixelSizeY:hover {
   cursor: pointer;
 }

 .color-picker {
   display: block;
   position: absolute;
   bottom: 35px;
   left: 30px;
   z-index: 4;
 }

</style>
