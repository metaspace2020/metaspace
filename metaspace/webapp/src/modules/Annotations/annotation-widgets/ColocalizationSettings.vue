<template>
  <span id="colocalization-settings">
    <el-form label-position="top">
      <el-form-item>
        <span slot="label">
          Colocalization algorithm
          <el-popover
            trigger="hover"
            placement="top"
          >
            <div style="max-width: 550px;">
              <p>
                The <b>median-thresholded cosine distance</b> algorithm is the best choice for
                exploring most datasets in METASPACE.
                It was found to highly reproduce expert rankings of mass spectrometry ion images
                and performed better than other traditional colocalization measures. <br />
                Its description and evaluation can be found in:
                <a
                  href="https://doi.org/10.1093/bioinformatics/btaa085"
                  target="blank"
                >Ovchinnikova et al. (2020) ColocML</a>.
              </p>
              <p>
                The <b>cosine distance</b> was previously used as the default colocalization measure.
                It is still available and can be selected from the list.
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
