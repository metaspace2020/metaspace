<template>
  <el-popover
    v-if="showIsomers || showIsobars"
    trigger="hover"
    class="popover"
  >
    <div v-if="showIsomers">
      <p v-if="isomers.length === 1">
        An isomeric ion was also annotated:
      </p>
      <p v-else>
        {{ isomers.length }} more isomeric ions were also annotated:
      </p>
      <ul>
        <li
          v-for="(isomer, i) in isomers"
          :key="i"
        >
          <molecular-formula :ion="isomer.ion" />
        </li>
      </ul>
    </div>
    <div v-if="showIsobars">
      <p v-if="isobars.length === 1">
        An isobaric ion was also annotated:
      </p>
      <p v-else>
        {{ isobars.length }} more isobaric ions were also annotated:
      </p>
      <ul>
        <li
          v-for="(isobar, i) in isobars"
          :key="i"
        >
          <molecular-formula :ion="isobar.ion" />
        </li>
      </ul>
      <p class="max-w-measure-1">
        This <b>Molecules</b> panel lists candidate molecules from the isobaric
        {{ isobars.length === 1 ? 'ion' : 'ions' }},
        and the <b>Diagnostics</b> panel contains more information about the overlapping isotopic peaks.
      </p>
    </div>
    <div
      slot="reference"
      class="ambiguity-alert-icon"
    />
  </el-popover>
</template>
<script>
import MolecularFormula from '../../../components/MolecularFormula'

import config from '../../../lib/config'

export default {
  components: {
    MolecularFormula,
  },
  props: {
    isomers: Array,
    isobars: Array,
  },
  computed: {
    showIsomers() {
      return config.features.isomers && this.isomers && this.isomers.length > 0
    },
    showIsobars() {
      return config.features.isobars && this.isobars && this.isobars.some(isobar => isobar.shouldWarn)
    },
  },
}
</script>
<style scoped>
  .popover {
    display: inline-block;
    margin: auto 20px;
  }
  .ambiguity-alert-icon {
    width: 20px;
    height: 20px;
    background-image: url('../../../assets/danger.svg');
  }
</style>
