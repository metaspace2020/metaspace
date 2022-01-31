<template>
  <div class="analysis-version-help">
    Selects the version of the METASPACE analysis pipeline to use. When comparing data between multiple datasets,
    it is recommended to process all datasets with the same analysis version. Otherwise, select the latest stable version.
    <h4>Changes between versions:</h4>
    <h5 v-if="showV15">
      Version 1.5 (unreleased version used for internal testing):
    </h5>
    <ul v-if="showV15">
      <li>Improved modeling of instrument mass accuracy at higher m/z values for TOF and Orbitrap.</li>
      <li>Improved isotopic peak calculation algorithm.</li>
    </ul>
    <h5>Version 2:</h5>
    <ul>
      <li>New ML-powered model for scoring annotations.</li>
      <li>New metrics for evaluating annotations' mass accuracy.</li>
      <li>Fine-grained reporting of FDR values.</li>
    </ul>
  </div>
</template>

<script>
import config from '../../../lib/config'
export default {
  name: 'AnalysisVersionHelp',
  computed: {
    showV15() { return config.features.advanced_ds_config },
  },
}
</script>

<style scoped>
  .analysis-version-help {
    max-width: 400px;
  }
</style>
