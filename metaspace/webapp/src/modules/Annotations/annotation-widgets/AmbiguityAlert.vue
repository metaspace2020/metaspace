<template>
  <new-feature-popup
    v-if="showIsomers || showIsobars"
    name="isomersIsobars"
    title="Isomers and isobars"
    :show-until="new Date('2020-05-30')"
    placement="top"
    class="flex items-center"
    reference-class="flex items-center"
  >
    <p>METASPACE now warns about isomeric and isobaric ambiguity.</p>
    <p>
      This icon <span class="danger-icon"></span> indicates that for this annotation,
      there are other isomers and/or isobars annotated. These are listed in the <b>Molecules</b> section.
    </p>
    <p>
      In case of isobaric annotations, the <b>Diagnostics</b> section allows for comparisons
      between overlapping annotations to help determine which annotation is more likely
      based on their isotopic patterns and images.
      The ion formulas of isomers and isobars are also available in the regular CSV export.
    </p>
    <el-popover
      slot="reference"
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
            <molecular-formula :ion="isomer.ion" />
          </li>
        </ul>
      </div>
      <div
        slot="reference"
        class="ambiguity-alert-icon"
      />
    </el-popover>
  </new-feature-popup>
</template>
<script>
import MolecularFormula from '../../../components/MolecularFormula'
import NewFeaturePopup from '../../../components/NewFeaturePopup.vue'

import config from '../../../lib/config'

export default {
  components: {
    MolecularFormula,
    NewFeaturePopup,
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
