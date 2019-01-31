<template>
  <div :style="style">
  </div>
</template>

<script lang="ts">
 import getColorScale from '../../../../lib/getColorScale';
 import Vue, { ComponentOptions } from 'vue';
 import { Prop, Component  } from 'vue-property-decorator';

 @Component({})
 export default class Colorbar extends Vue{
   @Prop({type: String, default: 'Viridis'})
   map!: string
   @Prop({type: String, default: 'right'})
   direction!: string

   get style(): object {
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
</script>
