<template>
  <el-popover trigger="hover" class="popover">
    <div>
      Isobaric annotations have been detected. Please view the Diagnostics panel for more information.
    </div>
    <div class="isomer-warning-icon" slot="reference" />
  </el-popover>
</template>
<script>
  import {renderMolFormulaHtml} from '../../../util';

  export default {
    props: {
      isobars: Array
    },
    methods: {
      renderMolFormulaHtml
    }
  }
</script>
<style scoped>
  .popover {
    display: inline-block;
    margin: auto 20px;
  }
  .isomer-warning-icon  {
    width: 20px;
    height: 20px;
    background-image: url('../../../assets/danger.svg');
  }
</style>
