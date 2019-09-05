<template>
  <el-popover trigger="hover" v-if="isomers.length > 0" class="popover">
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

  export default {
    props: {
      isomers: Array
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
