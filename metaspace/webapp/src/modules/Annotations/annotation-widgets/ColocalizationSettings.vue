<template>
  <span id="ion-image-settings">
    <el-form>
      <el-form-item label="Colocalization Algorithm">
        <el-select v-model="colocalizationAlgo"
                   style="width: 300px;"
                   title="Colocalization Algorithm">
          <el-option v-for="{id, name} in colocalizationAlgoOptions"
                     :key="id" :value="id" :label="name" />
        </el-select>
      </el-form-item>
    </el-form>
  </span>
</template>

<script lang="ts">
 import Vue from 'vue';
 import { Component } from 'vue-property-decorator'
 import {colocalizationAlgosQuery} from '../../../api/metadata';
 import {omit} from 'lodash-es';

 interface ColocalizationAlgoOption {
   id: string;
   name: string;
 }

 @Component({
   apollo: {
     colocalizationAlgos: colocalizationAlgosQuery,
   }
 })
 export default class ColocalizationSettings extends Vue {
   colocalizationAlgos: ColocalizationAlgoOption[] | null = null;

   get colocalizationAlgo(): string | null {
     return this.$store.getters.settings.annotationView.colocalizationAlgo
       || (this.colocalizationAlgoOptions.length > 0 ? this.colocalizationAlgoOptions[0].id : '');
   }
   set colocalizationAlgo(value: string | null) {
     if (!value || (this.colocalizationAlgoOptions.length > 0 && this.colocalizationAlgoOptions[0].id === value)) {
       this.$store.commit('setColocalizationAlgo', null);
     } else {
       this.$store.commit('setColocalizationAlgo', value);
     }
   }

   get colocalizationAlgoOptions(): ColocalizationAlgoOption[] {
     return this.colocalizationAlgos || [];
   }
 }
</script>

<style>
 #ion-image-settings {
   display: inline-flex;
   flex-direction: column;
   justify-content: center;
 }

 #ion-image-settings > .el-select {
   display: inline-flex;
 }
</style>
