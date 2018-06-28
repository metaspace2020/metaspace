<template>
  <div :style="style">
  </div>
</template>

<script lang="ts">
 import getColorScale from '../lib/getColorScale';
 import Vue, { ComponentOptions } from 'vue';

 export default Vue.extend({
   props: {
     map: {type: String, default: 'Viridis'},
     direction: {type: String, default: 'right'}
   },
   computed: {
     style(): Object {
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
 })
</script>
