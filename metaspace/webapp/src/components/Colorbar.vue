<template>
  <canvas ref="canvas" id="colorbar-canvas" width="256" height="1">
  </canvas>
</template>

<script>
 import {createColormap} from '../util.js';

 export default {
   props: ["map"],
   watch: {
     "map": function(colormap) { this.redraw(colormap) }
   },
   mounted() { this.redraw(this.map) },
   methods: {
     redraw(colormap) {
       this.colors = createColormap(colormap);
       let canvas = this.$refs.canvas,
           ctx = canvas.getContext("2d");

       var imageData = ctx.createImageData(canvas.width, canvas.height);
       var pixels = imageData.data;
       var numPixels = pixels.length / 4;

       for (let i = 0; i < numPixels; i++) {
         let c = this.colors[i];
         pixels[i*4] = c[0];
         pixels[i*4+1] = c[1];
         pixels[i*4+2] = c[2];
         pixels[i*4+3] = 255;
       }

       ctx.putImageData(imageData, 0, 0);
     }
   }
 }
</script>

<style>
 #colorbar-canvas {
   width: 150px;
 }
</style>
