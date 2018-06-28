<template>
  <div class="image-alignment-box"
        :style="boxStyle"
        @mousemove="onMouseMove">

    <div class="optical-img-container" style="height: calc(100%);">
      <img :src="opticalSrc"
            ref="scan"
            @load="onOpticalImageLoad"
            :style="opticalImageStyle"/>
    </div>

    <div class="handles-container">
      <svg ref="handles"
            :width="svgWidth"
            :height="svgHeight"
            :style="handleLayerStyle">
        <g :transform="layerTransform" v-if="!isNaN(scaleX * scaleY)">
          <circle class="handle"
                  v-if="fineTune"
                  v-for="(pos, idx) in handlePositions"
                  :cx="pos.x * scaleX + padding" :cy="pos.y * scaleY + padding" r="7"
                  @mousedown="onMouseDown($event, idx)">
          </circle>

          <!-- draw a cross showing the center of the original image -->
          <line :x1="centerPosition.x * scaleX + padding - 10"
                :x2="centerPosition.x * scaleX + padding + 10"
                :y1="centerPosition.y * scaleY + padding + 10"
                :y2="centerPosition.y * scaleY + padding - 10"
                class="cross"></line>
          <line :x1="centerPosition.x * scaleX + padding - 10"
                :x2="centerPosition.x * scaleX + padding + 10"
                :y1="centerPosition.y * scaleY + padding - 10"
                :y2="centerPosition.y * scaleY + padding + 10"
                class="cross"></line>
        </g>
      </svg>
    </div>

    <image-loader
        :src="massSpecSrc"
        ref="annotImage"
        :style="annotImageStyle"
        @dblclick.native="onDoubleClick"
        @mousedown.native="onImageMouseDown"
        @contextmenu.native="onImageRightMouseDown"
        style="z-index: 5;"
        :max-height=100500
        @wheel.native="onWheel"
        :annot-image-opacity="annotImageOpacity"
        opacity-mode="linear"
        :transform="annotImageTransformCSS"
        @redraw="onLoad">
    </image-loader>

  </div>
</template>

<script>
 import Vue from 'vue';
 import ImageLoader from './ImageLoader.vue';
 import {inv, dot, diag, getDiag} from 'numeric';
 import {scrollDistance} from '../util';

 function computeTransform(src, dst) {
   // http://franklinta.com/2014/09/08/computing-css-matrix3d-transforms/
   let A = [];
   let b = [];
   for (let i = 0; i < 4; i++) {
     A.push([src[i].x, src[i].y, 1, 0, 0, 0, -src[i].x * dst[i].x, -src[i].y * dst[i].x]);
     b.push(dst[i].x);
     A.push([0, 0, 0, src[i].x, src[i].y, 1, -src[i].x * dst[i].y, -src[i].y * dst[i].y]);
     b.push(dst[i].y);
   }

   const coeffs = dot(inv(A), b);

   return [
     [coeffs[0], coeffs[1], coeffs[2]],
     [coeffs[3], coeffs[4], coeffs[5]],
     [coeffs[6], coeffs[7], 1]
   ];
 }

 function computeHandlePositions(transformationMatrix, src) {
   function transformFunc({x, y}) {
     const a = transformationMatrix,
           w = a[2][0] * x + a[2][1] * y + a[2][2],
           x_ = (a[0][0] * x + a[0][1] * y + a[0][2]) / w,
           y_ = (a[1][0] * x + a[1][1] * y + a[1][2]) / w;
     return {x: x_, y: y_};
   }

   return src.map(transformFunc);
 }

 export default {
   name: 'image-aligner',
   components: {
     ImageLoader
   },
   props: {
     opticalSrc: {
       // URL of an optical image
       type: String
     },
     massSpecSrc: {
       // URL of a grayscale image
       type: String
     },
     annotImageOpacity: {
       type: Number,
       default: 1
     },
     padding: {
       type: Number,
       default: 100
     },
     rotationAngleDegrees: {
       type: Number,
       default: 0
     },
     initialTransform: {
       type: Array,
       default: [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
     }
   },
   data() {
     return {
       width: 0,
       height: 0,
       naturalWidth: 0,
       naturalHeight: 0,
       opticalImageWidth: 0,
       opticalImageHeight: 0,
       opticalImageNaturalWidth: 0,
       opticalImageNaturalHeight: 0,
       draggedHandle: null, // index of the handle being dragged
       handleStartX: null,  // position of the dragged handle center when drag starts
       handleStartY: null,
       dragStartX: null,    // position of the mouse when the drag starts
       dragStartY: null,
       dragThrottled: false,
       resizeThrottled: false,
       normalizedTransform: this.initialTransform,
       lastRotationAngle: this.rotationAngleDegrees,
       startRotationAngle: null,
       fineTune: false,
       imageDrag: true, // or rotate if false
     };
   },

   mounted: function() {
     window.addEventListener('resize', this.onResize);
   },

   beforeDestroy: function() {
     window.removeEventListener('resize', this.onResize);
   },

   methods: {
     originalHandlePositions() {
       return [
         {x: 0, y: 0},
         {x: 0, y: this.naturalHeight},
         {x: this.naturalWidth, y: 0},
         {x: this.naturalWidth, y: this.naturalHeight}
       ];
     },

     onOpticalImageLoad() {
       this.opticalImageWidth = this.$refs.scan.width;
       this.opticalImageHeight = this.$refs.scan.height;
       this.opticalImageNaturalWidth = this.$refs.scan.naturalWidth;
       this.opticalImageNaturalHeight = this.$refs.scan.naturalHeight;
       this.normalizedTransform = this.initialTransform;
     },

     onResize() {
       if (this.resizeThrottled)
         return;

       this.resizeThrottled = true;
       setTimeout(() => { this.resizeThrottled = false; }, 50);

       if (!this.$refs.scan)
         return;

       this.opticalImageWidth = this.$refs.scan.width;
       this.opticalImageHeight = this.$refs.scan.height;
     },

     onLoad({width, height}) {
       const oldWidth = this.width,
             oldHeight = this.height;
       this.width = width;
       this.height = height;
       this.naturalWidth = this.$refs.annotImage.getImage().naturalWidth;
       this.naturalHeight = this.$refs.annotImage.getImage().naturalHeight;
     },

     onMouseDown(event, handleIndex) {
       event.preventDefault();
       this.draggedHandle = handleIndex;
       this.dragStartX = event.clientX;
       this.dragStartY = event.clientY;
       this.handleStartX = this.handlePositions[handleIndex].x;
       this.handleStartY = this.handlePositions[handleIndex].y;
       document.addEventListener('mouseup', this.onMouseUp);
     },

     onWheel(event) {
       event.preventDefault();

       const zoom = 1 - scrollDistance(event) / 30.0;
       const rect = this.$refs.scan.getBoundingClientRect(),
             x = (event.clientX - rect.left) / this.scaleX,
             y = (event.clientY - rect.top) / this.scaleY,
             m = [[zoom, 0, -(zoom - 1)*x],
                  [0, zoom, -(zoom - 1)*y],
                  [0, 0, 1]];
       this.normalizedTransform = dot(m, this.normalizedTransform);
     },

     updateHandlePosition(event) {
       let pos = this.handlePositions.slice();

       if (this.draggedHandle !== null) { // dragging one handle
         pos[this.draggedHandle] = {
           x: this.handleStartX + (event.clientX - this.dragStartX) / this.scaleX,
           y: this.handleStartY + (event.clientY - this.dragStartY) / this.scaleY
         };
       } else { // dragging the image
         pos[0] = {
           x: this.handleStartX + (event.clientX - this.dragStartX) / this.scaleX,
           y: this.handleStartY + (event.clientY - this.dragStartY) / this.scaleY
         };
         for (let i = 1; i < 4; i++)
           pos[i] = {
             x: this.handlePositions[i].x - this.handlePositions[0].x + pos[0].x,
             y: this.handlePositions[i].y - this.handlePositions[0].y + pos[0].y
           };
       }

       this.normalizedTransform = computeTransform(this.originalHandlePositions(), pos);
     },

     updateRotation(event){
     },

     onMouseUp(event) {
       this.updateHandlePosition(event);
       this.draggedHandle = null;
       this.dragThrottled = false;
       document.removeEventListener('mouseup', this.onMouseUp);
       this.dragStartX = this.dragStartY = null;
     },

     onRightMouseUp(event) {
       this.updateRotation(event);
       this.draggedHandle = null;
       this.dragThrottled = false;
       document.removeEventListener('mouseup', this.onRightMouseUp);
       this.dragStartX = this.dragStartY = null;
       this.imageDrag = true

     },

     onMouseMove(event) {
       if (this.imageDrag === true){
         this.onImageDrag(event)
       }
       else {
         this.onImageRotate(event)
       }
     },

     onImageDrag(event){
       if (this.dragStartX === null || this.dragThrottled)
         return;

       this.dragThrottled = true;
       setTimeout(() => { this.dragThrottled = false; }, 30);
       this.updateHandlePosition(event);
     },

     onImageRotate(event){
       if (this.dragStartX === null || this.dragThrottled)
         return;
       this.dragThrottled = true;
       setTimeout(() => { this.dragThrottled = false; }, 30);
       let cp = {
         x: this.centerPosition.x * this.scaleX + this.padding,
         y: this.centerPosition.x * this.scaleX + this.padding,
        };
       const rect = this.$refs.scan.getBoundingClientRect();

       let a = {
         x: (this.dragStartX- rect.left) / this.scaleX,
         y: (this.dragStartY- rect.top) / this.scaleY,
       };
       let b = {
         x: (event.clientX - rect.left) / this.scaleX,
         y: (event.clientY - rect.top) / this.scaleY,

       };

       let a1 = Math.atan2(a.x-cp.x, a.y-cp.y);
       let a2 = Math.atan2(b.x-cp.x, b.y-cp.y);
       let deltaAngle = (360.0 / Math.PI) * (a1 - a2);

       this.$emit('updateRotationAngle', this.startRotationAngle + deltaAngle);
       },

     onImageMouseDown(event) {
       event.preventDefault();
       this.dragStartX = event.clientX;
       this.dragStartY = event.clientY;
       this.handleStartX = this.handlePositions[0].x;
       this.handleStartY = this.handlePositions[0].y;
       document.addEventListener('mouseup', this.onMouseUp);
     },

     onImageRightMouseDown(event) {
       event.preventDefault();
       this.imageDrag=false;
       this.startRotationAngle = this.rotationAngleDegrees;
       document.removeEventListener('mouseup', this.onMouseUp);
       this.dragStartX = event.clientX;
       this.dragStartY = event.clientY;
       this.handleStartX = this.handlePositions[0].x;
       this.handleStartY = this.handlePositions[0].y;
       document.addEventListener('mouseup', this.onRightMouseUp);
     },

     onDoubleClick(event){
       this.fineTune = !this.fineTune;
     },

     reset() {
       this.normalizedTransform = dot(diag([
         (this.width / this.naturalWidth) / this.scaleX,
         (this.height / this.naturalHeight) / this.scaleY,
         1
       ]), this.rotationMatrix(this.rotationAngleDegrees));
     },

     rotationMatrix(degrees) {
       const c = Math.cos(degrees / 180 * Math.PI),
             s = Math.sin(degrees / 180 * Math.PI),
             x = -this.naturalWidth / 2,
             y = -this.naturalHeight / 2;
       return [[c, -s, (c-1) * x - s * y],
               [s, c, (c-1) * y + s * x],
               [0, 0, 1]];
     }
   },
   computed: {
     layerTransform() {
       return 'translate(0, 0)';
     },

     transform() {
       const scaleAnnot = diag([
         this.naturalWidth / this.width,
         this.naturalHeight / this.height,
         1
       ]);
       const scaleOptical = diag([
         this.opticalImageWidth / this.opticalImageNaturalWidth,
         this.opticalImageHeight / this.opticalImageNaturalHeight,
         1
       ]);

       return dot(scaleOptical, dot(this.normalizedTransform, scaleAnnot));
     },

     handlePositions() {
       // in original optical image dimensions
       return computeHandlePositions(this.normalizedTransform, this.originalHandlePositions());
     },

     centerPosition() {
       return computeHandlePositions(this.normalizedTransform,
                                     [{x: this.naturalWidth / 2,
                                       y: this.naturalHeight / 2}])[0];
     },

     scaleX() {
       return this.opticalImageWidth / this.opticalImageNaturalWidth;
     },

     scaleY() {
       return this.opticalImageHeight / this.opticalImageNaturalHeight;
     },
     annotImageTransformCSS() {
       const a = this.transform;
       return `matrix3d(${a[0][0]}, ${a[1][0]}, 0, ${a[2][0]},
                        ${a[0][1]}, ${a[1][1]}, 0, ${a[2][1]},
                                 0,          0, 1,          0,
                        ${a[0][2]}, ${a[1][2]}, 0, ${a[2][2]})`;
     },

     annotImageStyle() {
       return {
         'margin-top': (-this.svgHeight + this.padding) + 'px',
         'margin-left': this.padding + 'px',
         'vertical-align': 'top',
         width: '500px', // fixed width to simplify calculations
         'z-index': 8
       }
     },

     opticalImageStyle() {
       return {
         'z-index': 1,
         'margin': this.padding + 'px',
         'width': `calc(100% - ${this.padding * 2}px)`
       };
     },

     boxStyle() {
       return {
         height: this.opticalImageHeight + this.padding * 2 + 'px',
         border: 'solid #ddf 1px'
       }
     },

     svgWidth() {
       return this.opticalImageWidth + 2 * this.padding;
     },

     svgHeight() {
       return this.opticalImageHeight + 2 * this.padding;
     },

     handleLayerStyle() {
       return {
         'z-index': 10,
         'pointer-events': 'none', // pass mouse events to the lower levels
         'vertical-align': 'top',
         'position': 'relative',
         'margin-top': (-this.opticalImageHeight - this.padding * 2) + 'px',
       }
     }
   },

   watch: {
     padding() {
       this.$nextTick(() => {
         this.onResize();
       });
     },

     rotationAngleDegrees(deg) {
       this.normalizedTransform = dot(
         this.normalizedTransform,
         this.rotationMatrix(deg - this.lastRotationAngle)
       );
       this.lastRotationAngle = deg;
     },

     initialTransform() {
       this.normalizedTransform = this.initialTransform;
     }
   }
 }
</script>

<style>
 circle.handle {
   cursor: move;
   stroke-width: 4px;
   stroke: #ffb000;
   fill: none;

   /* we want the unpainted interior to respond to hover */
   pointer-events: all;
 }

 line.cross {
   stroke: #f0fff0;
   stroke-width: 2
 }

 .optical-img-container, .handles-container {
   line-height: 0;
 }
</style>
