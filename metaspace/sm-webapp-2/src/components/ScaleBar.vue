<template>
  <div class="scale-bar">
    <div
      v-if="xStyle != null"
      class="scale-bar-x"
      :style="xStyle"
    >
      <div
        class="scale-bar-x-text"
        :class="{'scale-bar-x-text-offset': yStyle != null}"
      >
        {{ xParams.text }}
      </div>
    </div>
    <div
      v-if="yStyle != null"
      class="scale-bar-y"
      :style="yStyle"
    >
      <div class="scale-bar-y-text">
        {{ yParams.text }}
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed, toRefs } from 'vue';

const getNiceBarLength = (scale, minLength = 50) => {
  const STEPS = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500]
  const SCALES = [
    [1e-6, 'pm'],
    [1e-3, 'nm'],
    [1, 'µm'],
    [1e3, 'mm'],
    [1e6, 'm'],
  ]

  if (scale * minLength > 0.5e-6) {
    for (const [unitScale, unit] of SCALES) {
      for (const step of STEPS) {
        const candidateScale = unitScale * step
        if (scale * minLength < candidateScale) {
          return {
            scale: candidateScale,
            length: candidateScale / scale,
            text: `${step} ${unit}`,
          }
        }
      }
    }
  }
  return null
}

export default defineComponent({
  name: 'ScaleBar',
  props: {
    xScale: Number,
    yScale: Number,
    scaleBarColor: {
      type: String,
      default: '#000000',
    },
  },
  setup(props) {
    const { xScale, yScale, scaleBarColor } = toRefs(props);

    const xParams = computed(() => xScale.value != null ? getNiceBarLength(xScale.value) : null);
    const yParams = computed(() => yScale.value != null ? getNiceBarLength(yScale.value) : null);

    const xStyle = computed(() => {
      if (xParams.value) {
        return {
          color: scaleBarColor.value,
          borderColor: scaleBarColor.value,
          width: `${xParams.value.length}px`,
        };
      }
      return null;
    });

    const yStyle = computed(() => {
      if (yParams.value && Math.abs(xScale.value / yScale.value - 1) > 0.01) {
        return {
          color: scaleBarColor.value,
          borderColor: scaleBarColor.value,
          height: `${yParams.value.length}px`,
        };
      }
      return null;
    });


    return {
      xParams,
      yParams,
      xStyle,
      yStyle,

    };
  },
});
</script>

<style lang="scss" scoped>
  .scale-bar {
    position: absolute;
    bottom: 20px;
    left: 20px;
    font-weight: bold;
    z-index: 3;
  }

  .scale-bar-x {
    position: absolute;
    left: 0;
    bottom: 0;
    border-bottom: 5px solid;
  }

  .scale-bar-x-text {
    /*width: 100%;*/
    margin: 0 -20px;
    text-align: center;
  }
  .scale-bar-x-text-offset {
    padding-left: 10px;
  }

  .scale-bar-y {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100px;
    border-left: 5px solid;
  }

  .scale-bar-y-text {
    position: absolute;
    line-height: 1em;
    top: -0.5em;
    left: 3px;
    width: 100px;
  }
</style>
