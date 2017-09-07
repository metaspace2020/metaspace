<template>
  <div>
    <div>
      <span>Opacity:</span>
      <span> <el-slider :min=0 :max=1 :step=0.01 v-model="opacity"></el-slider></span>
    </div>

    <div class="image-alignment-box"
         :style="boxStyle"
         @mousemove="onMouseMove">
      <img :src="opticalSrc"
           width="100%"
           ref="scan"
           @load="onOpticalImageLoad"
           :style="opticalImageStyle"/>

      <svg ref="handles"
           :width="opticalImageWidth + 2 * margin"
           :height="opticalImageHeight + 2 * margin"
           style="position: absolute; z-index: 10; pointer-events: none;">
        <g :transform="layerTransform">
          <circle class="handle"
                  v-for="(pos, idx) in handlePositions"
                  :cx="pos.x" :cy="pos.y" r="7"
                  @mousedown="onMouseDown($event, idx)">
          </circle>
        </g>
      </svg>

      <image-loader
          :src="massSpecSrc"
          ref="annotImage"
          :style="annotImageStyle"
          @mousedown.native="onImageMouseDown"
          style="z-index: 5;"
          @redraw="onLoad">
      </image-loader>
    </div>
  </div>
</template>

<script>
 import Vue from 'vue';
 import ImageLoader from './ImageLoader.vue';
 import {inv, transpose, lusolve} from 'mathjs';

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
     }
   },
   data() {
     return {
       width: 0,
       height: 0,
       naturalWidth: 0,
       naturalHeight: 0,
       opacity: 0.5,
       opticalImageWidth: 0,
       opticalImageHeight: 0,
       opticalImageNaturalWidth: 0,
       opticalImageNaturalHeight: 0,
       margin: 10,
       handlePositions: [{x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}],
       draggedHandle: null, // index of the handle being dragged
       handleStartX: null,  // position of the dragged handle center when drag starts
       handleStartY: null,
       dragStartX: null,    // position of the mouse when the drag starts
       dragStartY: null,
       dragThrottled: false,
       resizeThrottled: false,
       transform: [[1, 0, 0],
                   [0, 1, 0],
                   [0, 0, 1]]
     }
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
         {x: 0, y: this.height},
         {x: this.width, y: 0},
         {x: this.width, y: this.height}
       ];
     },

     onOpticalImageLoad() {
       this.opticalImageWidth = this.$refs.scan.width;
       this.opticalImageHeight = this.$refs.scan.height;
       this.opticalImageNaturalWidth = this.$refs.scan.naturalWidth;
       this.opticalImageNaturalHeight = this.$refs.scan.naturalHeight;
       this.recomputeTransform();
     },

     onResize() {
       if (this.resizeThrottled)
         return;

       this.resizeThrottled = true;
       setTimeout(() => { this.resizeThrottled = false; }, 50);

       if (!this.$refs.scan)
         return;
       const newWidth = this.$refs.scan.width;
       const newHeight = this.$refs.scan.height;

       const scaleX = newWidth / this.opticalImageWidth,
             scaleY = newHeight / this.opticalImageHeight;

       this.handlePositions = this.handlePositions.map(pos => ({
         x: pos.x * scaleX,
         y: pos.y * scaleY
       }));

       this.opticalImageWidth = newWidth;
       this.opticalImageHeight = newHeight;

       this.recomputeTransform();
     },

     onLoad({width, height}) {
       if (this.width * this.height > 0)
         return; // ignore all but the first redraw of the IMS image
       this.width = width;
       this.height = height;
       this.naturalWidth = this.$refs.annotImage.getImage().naturalWidth;
       this.naturalHeight = this.$refs.annotImage.getImage().naturalHeight;
       this.handlePositions = this.originalHandlePositions();
       this.recomputeTransform();
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

     updateHandlePosition(event) {
       if (this.draggedHandle !== null) { // dragging one handle
         Vue.set(this.handlePositions, this.draggedHandle, {
           x: this.handleStartX + event.clientX - this.dragStartX,
           y: this.handleStartY + event.clientY - this.dragStartY
         });
       } else { // dragging the image
         let newHandlePositions = [];
         newHandlePositions.push({
           x: this.handleStartX + event.clientX - this.dragStartX,
           y: this.handleStartY + event.clientY - this.dragStartY
         });
         let p = newHandlePositions[0];
         for (let i = 1; i < 4; i++)
           newHandlePositions.push({
             x: this.handlePositions[i].x - this.handlePositions[0].x + p.x,
             y: this.handlePositions[i].y - this.handlePositions[0].y + p.y
           });
         this.handlePositions = newHandlePositions;
       }
     },

     onMouseUp(event) {
       this.updateHandlePosition(event);
       this.draggedHandle = null;
       this.dragThrottled = false;
       document.removeEventListener('mouseup', this.onMouseUp);
       this.dragStartX = this.dragStartY = null;

       this.recomputeTransform();
     },

     recomputeTransform() {
       let src = this.originalHandlePositions(),
           dst = this.handlePositions;

       // http://franklinta.com/2014/09/08/computing-css-matrix3d-transforms/
       let A = [];
       let b = [];
       for (let i = 0; i < 4; i++) {
         A.push([src[i].x, src[i].y, 1, 0, 0, 0, -src[i].x * dst[i].x, -src[i].y * dst[i].x]);
         b.push(dst[i].x);
         A.push([0, 0, 0, src[i].x, src[i].y, 1, -src[i].x * dst[i].y, -src[i].y * dst[i].y]);
         b.push(dst[i].y);
       }

       const coeffs = lusolve(A, b).map(x => x[0]);

       this.transform = [[coeffs[0], coeffs[3], coeffs[6]],
                         [coeffs[1], coeffs[4], coeffs[7]],
                         [coeffs[2], coeffs[5], 1]];
     },

     onMouseMove(event) {
       if (this.dragStartX === null || this.dragThrottled)
         return;

       this.dragThrottled = true;
       setTimeout(() => { this.dragThrottled = false; }, 20);
       this.updateHandlePosition(event);
       this.recomputeTransform();
     },

     onImageMouseDown(event) {
       event.preventDefault();
       this.dragStartX = event.clientX;
       this.dragStartY = event.clientY;
       this.handleStartX = this.handlePositions[0].x;
       this.handleStartY = this.handlePositions[0].y;
       document.addEventListener('mouseup', this.onMouseUp);
     },

     /*
        the transform sending an IMS image to the optical image, using natural dimensions for both
     */
     getNormalizedTransform() {
       let scaleXfwd = this.width / this.naturalWidth,
           scaleYfwd = this.height / this.naturalHeight,
           scaleXrev = this.opticalImageNaturalWidth / this.opticalImageWidth,
           scaleYrev = this.opticalImageNaturalHeight / this.opticalImageHeight;
       let scaleX = scaleXfwd * scaleXrev,
           scaleY = scaleYfwd * scaleYrev;

       return [[coeffs[0] * scaleX, coeffs[3] * scaleX, coeffs[6] * scaleXfwd],
               [coeffs[1] * scaleY, coeffs[4] * scaleY, coeffs[7] * scaleYfwd],
               [coeffs[2] * scaleXrev, coeffs[5] * scaleYrev, 1]];
     },

     /*
        the transform sending the optical image to an IMS image, using natural dimensions for both
     */
     getInvertedNormalizedTransform() {
       let inverted = inv(this.getNormalizedTransform());
       for (let i = 0; i < 3; i++)
         for (let j = 0; j < 3; j++)
           inverted[i][j] /= inverted[2][2];
       return inverted;
     }
   },
   computed: {
     layerTransform() {
       return `translate(${this.margin}, ${this.margin})`;
     },

     annotImageStyle() {
       const a = this.transform;
       return {
         position: 'absolute',
         left: this.margin + 'px',
         top: this.margin + 'px',
         transform: `matrix3d(${a[0][0]}, ${a[0][1]}, 0, ${a[0][2]},
                              ${a[1][0]}, ${a[1][1]}, 0, ${a[1][2]},
                                       0,          0, 1,          0,
                              ${a[2][0]}, ${a[2][1]}, 0, ${a[2][2]})`,
         'transform-origin': '0 0',
         opacity: this.opacity
       }
     },

     opticalImageStyle() {
       return {
         'z-index': 1,
         position: 'absolute',
         left: this.margin + 'px',
         top: this.margin + 'px'
       };
     },

     boxStyle() {
       return {
         height: this.opticalImageHeight + this.margin * 2 + 'px'
       }
     }
   }
 }
</script>

<style>
 .image-alignment-box {
   position: relative;
   left: 10px;
   top: 10px;
 }

 circle.handle {
   cursor: move;
   stroke-width: 4px;
   stroke: #ffb000;
   fill: none;

   /* we want the unpainted interior to respond to hover */
   pointer-events: all;
 }
</style>
