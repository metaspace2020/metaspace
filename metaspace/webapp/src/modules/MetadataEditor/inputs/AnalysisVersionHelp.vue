<template>
  <div class="analysis-version-help">
    When comparing data between multiple datasets, it is recommended to process all datasets with the same analysis
    version. Otherwise, select the latest version for best results.
    <h4 class="my-1">Changes:</h4>
    <h5 class="ml-2 my-2">Animal_v2.2023-12-14:</h5>
    <ul class="my-1">
      <li>New ML models trained on animal datasets.</li>
      <li>ML model trained and evaluated on n datasets.</li>
      <li>Improved annotation coverage, quality and reliability.</li>
    </ul>
    <h5 class="ml-2 my-2">Plant_v2.2023-12-14:</h5>
    <ul class="my-1">
      <li>New ML models trained on plant datasets.</li>
      <li>ML model trained and evaluated on n datasets.</li>
      <li>Improved annotation coverage, quality and reliability.</li>
    </ul>
    <p class="ml-2 text-xs">
      <i class="el-icon-warning-outline" /> Select <span class="model-input">Animal_v2.2023-12-14</span> or
      <span class="model-input">Plant_v2.2023-12-14</span> based on whether the submitted samples are obtained from
      species that are classified into animal or plant kingdom, respectively. If the samples are obtained from a
      different kingdom (e.g. Bacteria or Fungi), please use <span class="model-input">Animal_v2.2023-12-14</span> as
      this model is trained on a broader range of datasets and is designed to be indifferent to sample-specific
      metadata, focusing solely on ions and their corresponding feature scores. For more information, check out our
      <a target="_blank" href="https://www.biorxiv.org/content/10.1101/2023.05.29.542736v2">bioArxiv paper</a>
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
  max-width: 430px;
  word-break: normal;
}
.model-input {
  background: #eeeeee;
  padding: 2px;
  white-space: nowrap;
}
</style>
