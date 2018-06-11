<template>
  <div>
    <filter-panel level="dataset"></filter-panel>

    <div>
      <el-form :inline="true" style="display: inline-flex">
        <el-radio-group value="Summary" @input="onChangeTab" size="small">
          <el-radio-button label="List"></el-radio-button>
          <el-radio-button label="Summary"></el-radio-button>
        </el-radio-group>
      </el-form>
    </div>

    <div id="dataset-summary-charts">
      <upload-timeline-plot></upload-timeline-plot>
      <submitter-summary-plot></submitter-summary-plot>
      <mass-spec-setup-plot></mass-spec-setup-plot>
      <organism-summary-plot></organism-summary-plot>
    </div>
  </div>
</template>
<script>
  import UploadTimelinePlot from './DatasetUploadTimeline.vue';
  import SubmitterSummaryPlot from './SubmitterSummaryPlot.vue';
  import MassSpecSetupPlot from './MSSetupSummaryPlot.vue';
  import OrganismSummaryPlot from './OrganismSummaryPlot.vue';
  import FilterPanel from '../FilterPanel.vue';


  export default {
    components: {
      FilterPanel,
      UploadTimelinePlot,
      SubmitterSummaryPlot,
      MassSpecSetupPlot,
      OrganismSummaryPlot,
    },
    methods: {
      onChangeTab(tab) {
        this.$store.commit('setDatasetTab', tab);
      }
    }
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
