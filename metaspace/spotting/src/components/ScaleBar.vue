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
import Vue from 'vue'

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

export default Vue.extend({
  props: {
    xScale: Number, // In microns-per-pixel
    yScale: Number,
    scaleBarColor: {
      type: String,
      default: '#000000',
    },
  },
  computed: {
    scaleBarSizeBasis() {
      return 50
    },

    xParams() {
      return this.xScale != null ? getNiceBarLength(this.xScale) : null
    },

    yParams() {
      return this.yScale != null ? getNiceBarLength(this.yScale) : null
    },

    xStyle() {
      if (this.xParams != null) {
        return {
          color: this.scaleBarColor,
          borderColor: this.scaleBarColor,
          width: `${this.xParams.length}px`,
        }
      }
      return null
    },

    yStyle() {
      if (this.yParams != null && Math.abs(this.xScale / this.yScale - 1) > 0.01) {
        return {
          color: this.scaleBarColor,
          borderColor: this.scaleBarColor,
          height: `${this.yParams.length}px`,
        }
      }
      return null
    },
  },
  methods: {
    scaleBarAxisObj(pixelSizeAxis) {
      if (this.ionImage != null && this.pixelSizeIsActive && this.visibleImageWidth !== 0 && !this.isIE) {
        const notCeiledVal = (this.ionImage.width
            / (this.zoom * this.visibleImageWidth)) * this.scaleBarSizeBasis * pixelSizeAxis
        const steps = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000]
        let ceiledVal = steps.find(step => notCeiledVal < step)
        if (ceiledVal == null) {
          ceiledVal = Math.ceil(Math.round(this.ionImage.width
              / (this.zoom * this.visibleImageWidth) * this.scaleBarSizeBasis * pixelSizeAxis) / 10) * 10
        }
        const addedVal = (ceiledVal - notCeiledVal) / pixelSizeAxis
            * (this.zoom * this.visibleImageWidth) / this.ionImage.width
        return {
          scaleBarShownAxisVal: this.scaleBarSizeBasis + addedVal,
          axisExceeding: Math.round(this.scaleBarSizeBasis + addedVal) > this.parentDivWidth,
          scaleBarVal: ceiledVal >= 1000 ? `${Math.round(ceiledVal / 1000)} mm` : `${ceiledVal} µm`,
        }
      }
      return {}
    },
  },
})
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
