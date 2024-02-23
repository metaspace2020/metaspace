<template>
  <div :style="style" />
</template>

<script lang="ts">
import { defineComponent, PropType, computed } from 'vue'
import getColorScale from '../lib/getColorScale'
import { IonImage, renderScaleBar } from '../lib/ionImageRendering'
import createColormap from '../lib/createColormap'

export default defineComponent({
  name: 'Colorbar',
  props: {
    map: {
      type: String,
      default: 'Viridis',
    },
    horizontal: {
      type: Boolean,
      default: false,
    },
    ionImage: Object as PropType<IonImage>,
  },

  setup(props) {
    const style = computed(() => {
      if (props.ionImage != null) {
        const cmap = createColormap(props.map)
        return {
          backgroundImage: `url(${renderScaleBar(props.ionImage, cmap, props.horizontal)})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'repeat-x',
        }
      } else {
        const { domain, range } = getColorScale(props.map)
        const colors = []
        for (let i = 0; i < domain.length; i++) {
          colors.push(range[i] + ' ' + (domain[i] * 100 + '%'))
        }

        return {
          background: `linear-gradient(to ${props.horizontal ? 'right' : 'top'}, ${colors.join(', ')})`,
        }
      }
    })

    return {
      style,
    }
  },
})
</script>
