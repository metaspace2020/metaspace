<template>
  <div class="analysis-version-help">
    Perform an enrichment according to the selected enrichment ontology.
    <h5>Available databases - Lipid classes enrichment:</h5>
    <ul>
      <li>CoreMetabolome - v3.</li>
      <li>HMDB - v4.</li>
      <li>LipidMaps - 2017-12-12.</li>
      <li>SwissLipids - 2018-02-02.</li>
    </ul>
    <h5>Available databases - Metabolite classes enrichment:</h5>
    <ul>
      <li>Metabolite - class [HMDB - v4].</li>
      <li>Metabolite - pathway [HMDB - v4].</li>
      <li>Metabolite - tissue [HMDB - v4].</li>
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
