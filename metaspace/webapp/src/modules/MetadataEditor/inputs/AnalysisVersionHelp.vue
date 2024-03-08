<template>
  <div class="analysis-version-help">
    When comparing data between multiple datasets, it is recommended to process all datasets with the same
    analysis version. Otherwise, select the latest version for best results.
    <h4>Changes:</h4>
    <h5>Animal_v3.2023-12-14:</h5>
    <h5>Plant_v3.2023-12-14:</h5>
    <ul>
      <li>New ML models trained on animal and plant datasets seperately.</li>
      <li>ML models trained and evaluated on 1700+ datasets.</li>
      <li>Improved annotation coverage, quality and reliability.</li>
    </ul>
    <p>
      Select Animal_v3.2023-12-14 or Plant_v3.2023-12-14 based on whether the submitted samples are 
      obtained from species that are classified into animal or plant kingdom, respectively. 
      If the samples are obtained from a different kingdom (e.g. Bacteria or Fungi), 
      please use Animal_v3.2023-12-14 as this model is trained on a broader range of datasets 
      and is designed to be indifferent to sample-specific metadata, focusing solely on ions and their corresponding feature scores.
      For more information, check out our <a
      target="_blank"
      href="https://www.biorxiv.org/content/10.1101/2023.05.29.542736v2"
    >bioArxiv paper</a>
    </p>
    
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
