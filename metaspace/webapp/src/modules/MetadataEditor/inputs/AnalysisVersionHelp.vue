<template>
  <div class="analysis-version-help">
    When comparing data between multiple datasets, it is recommended to process all datasets with the same
    analysis version. Otherwise, select the latest version for best results.
    <h4>Changes:</h4>
    <h5>v2.20230517 (METASPACE-ML):</h5>
    <ul>
      <li>New metrics for evaluating annotations' mass accuracy.</li>
      <li>New ML-powered model for annotation scoring.</li>
      <li>Fine-grained reporting of FDR values.</li>
    </ul>
  </div>
</template>

<script>
export default {
  name: 'AnalysisVersionHelp',
}
</script>

<style scoped>
  .analysis-version-help {
    max-width: 400px;
  }
</style>
