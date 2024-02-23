<template>
  <el-popover v-if="showIsomers || showIsobars" trigger="hover" class="popover">
    <div v-if="showIsomers">
      <p v-if="isomers.length === 1">An isomeric ion was also annotated:</p>
      <p v-else>{{ isomers.length }} more isomeric ions were also annotated:</p>
      <ul>
        <li v-for="(isomer, i) in isomers" :key="i">
          <molecular-formula :ion="isomer.ion" />
        </li>
      </ul>
    </div>
    <div v-if="showIsobars">
      <p v-if="isobars.length === 1">An isobaric ion was also annotated:</p>
      <p v-else>{{ isobars.length }} more isobaric ions were also annotated:</p>
      <ul>
        <li v-for="(isobar, i) in isobars" :key="i">
          <molecular-formula :ion="isobar.ion" />
        </li>
      </ul>
      <p class="max-w-measure-1">
        This <b>Molecules</b> panel lists candidate molecules from the isobaric
        {{ isobars.length === 1 ? 'ion' : 'ions' }}, and the <b>Diagnostics</b> panel contains more information about
        the overlapping isotopic peaks.
      </p>
    </div>
    <template #reference>
      <div class="ambiguity-alert-icon" />
    </template>
  </el-popover>
</template>

<script>
import { defineComponent, computed } from 'vue'
import MolecularFormula from '../../../components/MolecularFormula'
import config from '../../../lib/config'

export default defineComponent({
  components: {
    MolecularFormula,
  },
  props: {
    isomers: Array,
    isobars: Array,
  },
  setup(props) {
    const showIsomers = computed(() => {
      return config.features.isomers && props.isomers && props.isomers.length > 0
    })

    const showIsobars = computed(() => {
      return config.features.isobars && props.isobars && props.isobars.some((isobar) => isobar.shouldWarn)
    })

    return {
      showIsomers,
      showIsobars,
    }
  },
})
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
