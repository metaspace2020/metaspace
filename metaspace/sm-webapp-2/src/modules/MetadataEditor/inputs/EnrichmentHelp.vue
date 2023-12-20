<template>
  <div class="analysis-version-help">
    When performing <a
      target="_blank"
      href="http://www.lipidontology.com/"
    >LION</a> enrichment, a lipid enrichment
    analysis will be performed based on LION.
    <h5>Available databases:</h5>
    <ul>
      <li>CoreMetabolome - v3.</li>
      <li>HMDB - v4.</li>
      <li>LipidMaps - 2017-12-12.</li>
      <li>SwissLipids - 2018-02-02.</li>
    </ul>
  </div>
</template>

<script>
export default {
  name: 'EnrichmentHelp',
}
</script>

<style scoped>
  .analysis-version-help {
    max-width: 400px;
  }
</style>
