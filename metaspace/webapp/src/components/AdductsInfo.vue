<template>
  <div>
    <span style="font-size: 16px; padding-left: 20px;">
      All adducts for this annotation in the same dataset
    </span>
    <div class="adduct-info-container">
      <el-col v-for="(other, idx) in sameAdductAnnotations" :key="idx"
              :xs="24" :sm="8" :md="8" :lg="8">
        <div class="small-peak-image" style="max-width: %">
          <span v-html="showAdduct(other.adduct)"></span><br/>
          {{  other.mz.toFixed(4) }}<br/>
          <image-loader :src="other.isotopeImages[0].url"
                        :colormap="colormap"
                        :max-height=250
                        class="ion-image">
          </image-loader>
          MSM score: {{ other.msmScore.toFixed(3) }}<br/>
          Annotated @ {{ other.fdrLevel }} FDR
        </div>
      </el-col>
    </div>
  </div>
</template>

<script>
 import gql from 'graphql-tag';
 import {renderMolFormula} from '../util.js';
 import ImageLoader from './ImageLoader.vue';

 export default {
   props: ['annotation', 'database'],
   components: {ImageLoader},
   computed: {
     colormap() {
       return this.$store.getters.settings.annotationView.colormap;
     }
   },
   apollo: {
     sameAdductAnnotations: {
       query: gql`query GetAdductData($datasetId: String!,
                                      $molFormula: String!,
                                      $db: String!) {
          allAnnotations(datasetFilter: {
            ids: $datasetId
          }, filter: {
            sumFormula: $molFormula, database: $db
          }) {
            mz
            adduct
            msmScore
            rhoSpatial
            rhoSpectral
            rhoChaos
            fdrLevel
            isotopeImages { url }
          }
       }`,
       variables() {
         return {
           db: this.database,
           datasetId: this.annotation.dataset.id,
           molFormula: this.annotation.sumFormula
         };
       },
       update: data => data.allAnnotations.slice().sort((a, b) => a.mz - b.mz)
     }
   },
   methods: {
     showAdduct(adduct) {
       return renderMolFormula(this.annotation.sumFormula, adduct, this.annotation.dataset.polarity);
     }
   }
 }
</script>

<style>
 .adduct-info-container {
   display: flex;
   flex-direction: row;
 }
</style>
