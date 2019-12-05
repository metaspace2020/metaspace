<template>
  <el-popover trigger="hover" v-if="showIsomers || showIsobars" class="popover">
    <div v-if="showIsomers">
      <p v-if="isomers.length === 1">An isomeric ion was also annotated:</p>
      <p v-else>{{isomers.length}} more isomeric ions were also annotated:</p>
      <ul>
        <li v-for="isomer in isomers" v-html="renderMolFormulaHtml(isomer.ion)" />
      </ul>
    </div>
    <div v-if="showIsobars">
      <p v-if="isobars.length === 1">An isobaric ion was also annotated:</p>
      <p v-else>{{isobars.length}} more isobaric ions were also annotated:</p>
      <ul>
        <li v-for="isobar in isobars" v-html="renderMolFormulaHtml(isobar.ion)" />
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
      showIsomers() {
        return config.features.isomers && this.isomers && this.isomers.length > 0;
      },
      showIsobars() {
        return config.features.isobars && this.isobars && this.isobars.some(isobar => isobar.shouldWarn);
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
