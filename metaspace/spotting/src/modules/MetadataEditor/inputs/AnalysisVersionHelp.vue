<template>
  <div class="analysis-version-help">
    Selects the version of the METASPACE analysis pipeline to use. When comparing data between multiple datasets,
    it is recommended to process all datasets with the same analysis version. Otherwise, select the latest stable version.
    <h4>Changes between versions:</h4>
    <h5>Version 2:</h5>
    <ul>
      <li>Improved modeling of instrument mass accuracy at higher m/z values for TOF and Orbitrap.</li>
      <li>Improved isotopic peak calculation algorithm.</li>
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
