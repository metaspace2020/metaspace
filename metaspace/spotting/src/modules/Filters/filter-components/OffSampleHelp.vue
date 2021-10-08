<template>
  <el-popover trigger="hover">
    <div class="off-sample-help-content">
      <p>
        This filter uses a machine learning model to classify annotations as either on- or off-sample.
        The classifications are based on image analysis, and may be less accurate in datasets that don't include an
        off-sample area, or where the off-sample area isn't visually distinct such as with dense cells.
      </p>
      <p>
        If you find this feature helpful, we would appreciate citations to the following paper:
      </p>
      <p>
        <a href="https://doi.org/10.1101/518977">Recognizing off-sample mass spectrometry images with machine and deep learning</a>, Ovchinnikova <i>et al.</i>
      </p>
    </div>
    <i
      slot="reference"
      class="el-icon-question help-icon"
    />
  </el-popover>
</template>
<style lang="scss" scoped>
  .off-sample-help-content {
    max-width: 450px;
  }
  .help-icon {
    margin-left: 2px;
  }
</style>
