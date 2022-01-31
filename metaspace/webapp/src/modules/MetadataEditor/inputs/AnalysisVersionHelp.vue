<template>
  <div class="analysis-version-help">
    When comparing data between multiple datasets, it is recommended to process all datasets with the same
    analysis version. Otherwise, select the latest version for best results.
    <h4>Changes:</h4>
    <h5 v-if="showV15">
      v1.5 (Prototype for higher RPs):
    </h5>
    <ul v-if="showV15">
      <li>Improved modeling of instrument mass accuracy at higher m/z values for TOF and Orbitrap.</li>
      <li>Improved isotopic peak calculation algorithm.</li>
    </ul>
    <h5>v2 (ML-powered MSM):</h5>
    <ul>
      <li>New metrics for evaluating annotations' mass accuracy.</li>
      <li>New ML-powered model for annotation scoring.</li>
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
