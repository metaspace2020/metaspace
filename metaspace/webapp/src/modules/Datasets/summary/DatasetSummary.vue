<template>
  <div>
    <filter-panel level="dataset" />

    <div>
      <el-form
        :inline="true"
        style="display: inline-flex"
      >
        <el-radio-group
          value="Summary"
          size="small"
          @input="onChangeTab"
        >
          <el-radio-button label="List" />
          <el-radio-button label="Summary" />
        </el-radio-group>
      </el-form>
    </div>

    <div id="dataset-summary-charts">
      <upload-timeline-plot />
      <submitter-summary-plot />
      <organism-summary-plot />
      <mass-spec-summary-chart />
    </div>
  </div>
</template>
<script>
import UploadTimelinePlot from './DatasetUploadTimeline.vue'
import SubmitterSummaryPlot from './SubmitterSummaryPlot.vue'
import MassSpecSetupPlot from './MSSetupSummaryPlot.vue'
import { MassSpecSummaryChart } from './MassSpecSummaryChart'
import OrganismSummaryPlot from './OrganismSummaryPlot.vue'
import { FilterPanel } from '../../Filters/index'

export default {
  components: {
    FilterPanel,
    UploadTimelinePlot,
    SubmitterSummaryPlot,
    OrganismSummaryPlot,
    MassSpecSummaryChart,
  },
  methods: {
    onChangeTab(tab) {
      this.$store.commit('setDatasetTab', tab)
    },
  },
}
</script>
<style>
  #dataset-summary-charts {
    flex-flow: row wrap;
    display: flex;
    justify-content: space-around;
    padding-bottom: 50px;
  }
</style>
