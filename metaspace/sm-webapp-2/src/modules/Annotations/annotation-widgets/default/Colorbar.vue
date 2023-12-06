<template>
  <div :style="computedStyle" />
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
// @ts-ignore
import { PropType } from 'vue';
import getColorScale from '../../../../lib/getColorScale';
import { IonImage, renderScaleBar } from '../../../../lib/ionImageRendering';
import createColormap from '../../../../lib/createColormap';

export default defineComponent({
  name: 'color-bar',
  props: {
    map: {
      type: String as PropType<string>,
      default: 'Viridis',
    },
    horizontal: {
      type: Boolean as PropType<boolean>,
      default: false,
    },
    ionImage: {
      type: Object as PropType<IonImage>,
      default: null,
    },
  },
  setup(props) {
    const computedStyle = computed(() => {
      if (props.ionImage) {
        const cmap = createColormap(props.map);
        return {
          backgroundImage: `url(${renderScaleBar(props.ionImage, cmap, props.horizontal)})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'repeat-x',
        };
      } else {
        const { domain, range } = getColorScale(props.map);
        const direction = props.map[0] === '-' ? 'bottom' : 'top';

        const colors = domain.map((d, i) => `${range[i]} ${d * 100}%`);

        return {
          background: `linear-gradient(to ${props.horizontal ? 'right' : direction}, ${colors.join(', ')})`,
        };
      }
    });

    return { computedStyle };
  },
});
</script>
