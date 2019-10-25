<template>
  <el-popover trigger="hover" v-if="visible" class="popover">
    <div>
      <p v-if="isomers.length === 1">An isomeric ion was also annotated:</p>
      <p v-else>{{isomers.length}} more isomeric ions were also annotated:</p>
      <ul>
        <li v-for="isomer in isomers" v-html="renderMolFormulaHtml(isomer.ion)" />
      </ul>
    </div>
    <div class="isomer-warning-icon" slot="reference" />
  </el-popover>
</template>
<script>
  import {renderMolFormulaHtml} from '../../../util';
  import config from '../../../config';

  export default {
    props: {
      isomers: Array,
      isobars: Array,
    },
    computed: {
      visible() {
        return (config.features.isomers && this.isomers && this.isomers.length > 0)
          || (config.features.isobars && this.isobars && this.isobars.some(isobar => isobar.shouldWarn));
      },
      text() {

      }
    },
    methods: {
      renderMolFormulaHtml
    },
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
