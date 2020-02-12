<template>
  <span id="colocalization-settings">
    <el-form>
      <el-form-item>
        <span slot="label">
          Colocalization algorithm
          <el-popover
            trigger="hover"
            placement="top"
          >
            <div style="max-width: 500px;">
              <p>
                <u>Median-thresholded cosine distance</u> is the best choice for exploring most biological datasets.
                It was found to outperform other traditional co-localization measures when compared
                to expert rankings of imaging-MS images.
                Its description and evaluation can be found in:
              </p>
              <p>
                <a href="https://doi.org/10.1101/758425">ColocAI: artificial intelligence approach to quantify co-localization between mass spectrometry images</a>, Ovchinnikova <i>et al.</i>
              </p>
              <p>
                <u>Cosine distance</u> was previously used as the default colocalization measure.  It has been
                preserved so that historical data remains consistent, and is comparable against new datasets.
              </p>
            </div>
            <i
              slot="reference"
              class="el-icon-question help-icon"
            />
          </el-popover>
        </span>
        <el-select
          v-model="colocalizationAlgo"
          style="width: 300px;"
          title="Colocalization algorithm"
        >
          <el-option
            v-for="{id, name} in colocalizationAlgoOptions"
            :key="id"
            :value="id"
            :label="name"
          />
        </el-select>
      </el-form-item>
    </el-form>
  </span>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component } from 'vue-property-decorator'
import { colocalizationAlgosQuery } from '../../../api/metadata'
import { omit } from 'lodash-es'

 interface ColocalizationAlgoOption {
   id: string;
   name: string;
 }

 @Component({
   apollo: {
     colocalizationAlgos: colocalizationAlgosQuery,
   },
 })
export default class ColocalizationSettings extends Vue {
   colocalizationAlgos: ColocalizationAlgoOption[] | null = null;

   get colocalizationAlgo(): string | null {
     return this.$store.getters.settings.annotationView.colocalizationAlgo
       || (this.colocalizationAlgoOptions.length > 0 ? this.colocalizationAlgoOptions[0].id : '')
   }

   set colocalizationAlgo(value: string | null) {
     if (!value || (this.colocalizationAlgoOptions.length > 0 && this.colocalizationAlgoOptions[0].id === value)) {
       this.$store.commit('setColocalizationAlgo', null)
     } else {
       this.$store.commit('setColocalizationAlgo', value)
     }
   }

   get colocalizationAlgoOptions(): ColocalizationAlgoOption[] {
     return this.colocalizationAlgos || []
   }
}
</script>

<style>
 #colocalization-settings {
   display: inline-flex;
   flex-direction: column;
   justify-content: center;
 }

 #colocalization-settings > .el-select {
   display: inline-flex;
 }
</style>
