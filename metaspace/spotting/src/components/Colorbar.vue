<template>
  <div :style="style" />
</template>

<script lang="ts">
import getColorScale from '../lib/getColorScale'
import Vue, { ComponentOptions } from 'vue'
import { Prop, Component } from 'vue-property-decorator'
import { IonImage, renderScaleBar } from '../lib/ionImageRendering'
import createColormap from '..//lib/createColormap'

 @Component({})
export default class Colorbar extends Vue {
   @Prop({ type: String, default: 'Viridis' })
   map!: string;

   @Prop({ type: Boolean, default: false })
   horizontal!: boolean;

   @Prop({ type: Object })
   ionImage!: IonImage;

   get style(): object {
     if (this.ionImage != null) {
       const cmap = createColormap(this.map)
       return {
         backgroundImage: `url(${renderScaleBar(this.ionImage, cmap, this.horizontal)})`,
         backgroundSize: 'contain',
         backgroundRepeat: 'repeat-x',
       }
     } else {
       const { domain, range } = getColorScale(this.map)
       const direction = this.map[0] === '-' ? 'bottom' : 'top'

       const colors = []
       for (let i = 0; i < domain.length; i++) {
         colors.push(range[i] + ' ' + (domain[i] * 100 + '%'))
       }

       return {
         background: `linear-gradient(to ${this.horizontal ? 'right' : 'top'}, ${colors.join(', ')}`,
       }
     }
   }
}
</script>
