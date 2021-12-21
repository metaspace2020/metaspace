<template>
  <el-row id="scores-table">
    <div
      v-if="showV1"
      class="msm-score-calc"
    >
      MSM score =
      <span>{{ annotation.msmScore.toFixed(3) }}</span> =
      <span>{{ annotation.rhoSpatial.toFixed(3) }}</span>
      (&rho;<sub>spatial</sub>) &times;
      <span>{{ annotation.rhoSpectral.toFixed(3) }}</span>
      (&rho;<sub>spectral</sub>) &times;
      <span>{{ annotation.rhoChaos.toFixed(3) }}</span>
      (&rho;<sub>chaos</sub>)
    </div>
    <div
      v-else-if="showV3"
      class="msm-score-calc"
    >
      MSM score <span>{{ annotation.msmScore.toFixed(3) }}</span> =
      <span>{{ scoringModel }}</span>(
      &rho;<sub>spatial</sub>=<span>{{ annotation.rhoSpatial.toFixed(3) }}</span>{{ ', ' }}
      &rho;<sub>spectral</sub>=<span>{{ annotation.rhoSpectral.toFixed(3) }}</span>{{ ', ' }}
      &rho;<sub>chaos</sub>=<span>{{ annotation.rhoChaos.toFixed(3) }}</span>{{ ', ' }}
      &rho;<sub>absoluteMz</sub>=<span>{{ annotation.rhoMzErrAbs.toFixed(3) }}</span>{{ ', ' }}
      &rho;<sub>relativeMz</sub>=<span>{{ annotation.rhoMzErrRel.toFixed(3) }}</span>
      )
    </div>
    <div
      v-else
      class="h-4"
    />
    <div v-if="showOffSample">
      <el-popover
        trigger="hover"
        :open-delay="100"
      >
        Image analysis gave an off-sample probability of {{ formattedOffSampleProb }}.
        <span
          slot="reference"
          :class="annotation.offSample ? 'off-sample-tag' : 'on-sample-tag'"
        >
          {{ annotation.offSample ? 'Off-sample' : 'On-sample' }}
        </span>
      </el-popover>
    </div>
  </el-row>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'

import config from '../../../../lib/config'
import safeJsonParse from '../../../../lib/safeJsonParse'

@Component({
})
export default class DiagnosticsMetrics extends Vue {
    @Prop()
    loading!: boolean

    @Prop()
    annotation: any

    get scoringModel(): string | null {
      // eslint-disable-next-line camelcase
      return this.annotation != null ? safeJsonParse(this.annotation.dataset.configJson)?.fdr.scoring_model : null
    }

    get showV1(): boolean {
      return this.annotation != null && this.scoringModel == null
    }

    get showV3(): boolean {
      return this.annotation != null && this.scoringModel != null
    }

    get showOffSample(): boolean {
      return this.annotation != null && config.features.off_sample && this.annotation.offSample != null
    }

    get formattedOffSampleProb(): string {
      if (this.annotation.offSampleProb < 0.1) {
        return 'less than 10%'
      } else if (this.annotation.offSampleProb > 0.9) {
        return 'greater than 90%'
      } else {
        return (+this.annotation.offSampleProb * 100).toFixed(0) + '%'
      }
    }
}
</script>

<style lang="scss" scoped>
@import "~element-ui/packages/theme-chalk/src/common/var";

#scores-table {
    display: flex;
    border-collapse: collapse;
    border: 1px solid lightblue;
    font-size: 16px;
    padding: 3px 10px;
    align-items: center;
}

.msm-score-calc {
    text-align: center;
    flex-grow: 1;
    justify-content: center;
}

.msm-score-calc > span {
    color: blue;
}

    .off-sample-tag {
        margin-left: 10px;
        color: white;
        padding: 0 3px;
        background: $--color-warning;
        border-radius: 3px;
    }
    .on-sample-tag {
        margin-left: 10px;
        color: white;
        padding: 0 3px;
        background: $--color-success;
        border-radius: 3px;
    }
</style>
