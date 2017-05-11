<template>
  <div :style="style">
  </div>
</template>

<script>
 import {getColorScale} from '../util.js';

 export default {
   props: {
     map: {type: String, default: 'Viridis'},
     direction: {type: String, default: 'right'}
   },
   computed: {
     style() {
       const {domain, range} = getColorScale(this.map);
       let colors = [];
       for (let i = 0; i < domain.length; i++)
         colors.push(range[i] + ' ' + (domain[i] * 100 + '%'));
       const background = "linear-gradient(to " + this.direction + ", " +
                          colors.join(", ") + ")";
       return {
         background
       };
     }
   }
 }
</script>
