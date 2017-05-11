<template>
  <el-row>
    <el-col>
      <el-collapse id="annot-content" :value="activeSections"
                   @change="onSectionsChange">

        <div class="el-collapse-item grey-bg">
          <div class="el-collapse-item__header av-centered grey-bg">
            <span class="sf-big" v-html="formattedMolFormula"> </span>
            <span class="mz-big">{{ annotation.mz.toFixed(4) }}</span>
          </div>
        </div>

        <el-collapse-item name="images" id="annot-img-collapse" class="av-centered">
          <span slot="title">
            <span style="padding-right: 20px">
              m/z image
            </span>

            <el-popover placement="left" trigger="click">
              <ion-image-settings></ion-image-settings>

              <div slot="reference" @click="$event.stopPropagation()">
                <i class="el-icon-setting" style="font-size: 20px; padding-top: 11px;"></i>
              </div>
            </el-popover>
          </span>

          <div class="main-ion-image-container">
            <image-loader :src="annotation.isotopeImages[0].url"
                          :colormap="colormap"
                          :max-height=500
                          class="ion-image principal-peak-image">
            </image-loader>

            <div class="colorbar-container">
              {{ annotation.isotopeImages[0].maxIntensity.toExponential(2) }}
              <colorbar style="width: 20px; height: 160px; align-self: center;"
                        direction="top" :map="colormap"
                        slot="reference">
              </colorbar>
              {{ annotation.isotopeImages[0].minIntensity.toExponential(2) }}
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item :title="compoundsTabLabel" name="compounds">
          <div id="compound-list">
            <div class="compound" v-for="compound in annotation.possibleCompounds">
              <el-popover placement="left" trigger="click">
                <img :src="compound.imageURL.replace('52.19.27.255', '52.51.114.30')" class="compound-thumbnail"
                     slot="reference"/>
                <div>
                  <figure>
                    <figcaption>
                      {{ compound.name }}
                      <br/>
                      <a :href="compound.information[0].url" target="_blank">
                        View on {{ compound.information[0].database }} website
                      </a>
                    </figcaption>
                    <img :src="compound.imageURL.replace('52.19.27.255', '52.51.114.30')" class="compound-image"/>
                  </figure>
                </div>
              </el-popover>
              <br/>

              <span v-if="compound.name.length <= 35">
                <a :href="compound.information[0].url" target="_blank">
                  {{ compound.name }}
                </a>
              </span>

              <span v-else>
                <a :href="compound.information[0].url" target="_blank"
                   :title="compound.name">
                  {{ compound.name.slice(0, 32) + '...' }}
                </a>
              </span>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item title="Diagnostics" name="scores">
          <el-row id="scores-table">
            MSM score =
            <span>{{ annotation.msmScore.toFixed(3) }}</span> =
            <span>{{ annotation.rhoSpatial.toFixed(3) }}</span>
            (&rho;<sub>spatial</sub>) &times;
            <span>{{ annotation.rhoSpectral.toFixed(3) }}</span>
            (&rho;<sub>spectral</sub>) &times;
            <span>{{ annotation.rhoChaos.toFixed(3) }}</span>
            (&rho;<sub>chaos</sub>)
          </el-row>
          <el-row id="isotope-images-container">
            <el-col :xs="24" :sm="12" :md="12" :lg="6"
                    v-for="(img, idx) in annotation.isotopeImages.filter(img => img.url !== null)"
                    :key="idx">
              <div class="small-peak-image">
                {{ img.mz.toFixed(4) }}<br/>
                <image-loader :src="img.url"
                              :colormap="colormap"
                              :max-height=250
                              class="ion-image">
                </image-loader>
              </div>
            </el-col>
          </el-row>
          <el-row id="isotope-plot-container">
            <isotope-pattern-plot :data="peakChartData"
                                  v-if="activeSections.indexOf('scores') !== -1">
            </isotope-pattern-plot>
          </el-row>
        </el-collapse-item>

        <el-collapse-item title="Dataset info" name="metadata">
          <dataset-info :metadata="JSON.parse(annotation.dataset.metadataJson)"
                        :expandedKeys="['Sample information', 'Submitted by', 'Submitter']">
          </dataset-info>
        </el-collapse-item>

        <el-collapse-item title="Related annotations" name="adducts">
          <adducts-info v-if="activeSections.indexOf('adducts') !== -1"
                        :annotation="annotation"
                        :database="this.$store.getters.filter.database">
          </adducts-info>
        </el-collapse-item>
      </el-collapse>
    </el-col>
  </el-row>
</template>

<script>
 import { renderMolFormula } from '../util.js';
 import DatasetInfo from './DatasetInfo.vue';
 import AdductsInfo from './AdductsInfo.vue';
 import ImageLoader from './ImageLoader.vue';
 import IonImageSettings from './IonImageSettings.vue';
 import IsotopePatternPlot from './IsotopePatternPlot.vue';
 import Colorbar from './Colorbar.vue';
 import {annotationQuery} from '../api/annotation.js';

 export default {
   name: 'annotation-view',
   props: ['annotation'],
   computed: {
     activeSections() {
       return this.$store.getters.settings.annotationView.activeSections;
     },

     colormap() {
       return this.$store.getters.settings.annotationView.colormap;
     },

     formattedMolFormula() {
       if (!this.annotation) return '';
       const { sumFormula, adduct, dataset } = this.annotation;
       return renderMolFormula(sumFormula, adduct, dataset.polarity);
     },

     compoundsTabLabel() {
       if (!this.annotation) return '';
       return "Molecules (" + this.annotation.possibleCompounds.length + ")";
     }
   },
   apollo: {
     peakChartData: {
       query: annotationQuery,
       update: ({annotation}) => {
         let chart = JSON.parse(annotation.peakChartData);
         chart.sampleData = {
           mzs: annotation.isotopeImages.map(im => im.mz),
           ints: annotation.isotopeImages.map(im => im.totalIntensity),
         };
         return chart;
       },
       variables() {
         return {
           id: this.annotation.id
         };
       }
     }
   },
   methods: {
     onSectionsChange(activeSections) {
       this.$store.commit('updateAnnotationViewSections', activeSections)
     }
   },

   components: {
     DatasetInfo,
     AdductsInfo,
     ImageLoader,
     IonImageSettings,
     IsotopePatternPlot,
     Colorbar
   }
 }
</script>

<style>
 .ion-image > img, .small-peak-image img {
   image-rendering: pixelated;
   image-rendering: -moz-crisp-edges;
   -ms-interpolation-mode: nearest-neighbor;
 }

 #isotope-images-container {
   margin: 0 auto;
   text-align: left;
   font-size: 0;
   margin-top: 10px;
 }

 .small-peak-image {
   font-size: 1rem;
   vertical-align: top;
   padding: 0 5px 0 5px;
   text-align: center;
 }

 .sf-big {
   text-shadow : 0 0 0px #000;
   font: 24px 'Roboto', sans-serif;
 }

 .mz-big {
   font: 24px 'Roboto';
   padding: 0px 20px;
 }

 #annot-content {
   width: 100%;
 }

 #compound-list {
   margin: 0 auto;
   text-align: left;
   font-size: 0;
 }

 .compound {
   display: inline-block;
   vertical-align: top;
   min-width: 250px;
   font-size: 1rem;
   margin: 10px;
   text-align: center;
 }

 .compound-thumbnail {
   height: 200px;
   width: 200px;
   cursor: pointer;
 }

 .compound-image {
   height: 700px;
 }

 #scores-table {
   border-collapse: collapse;
   border: 1px solid lightblue;
   font-size: 16px;
   text-align: center;
   padding: 3px;
 }

 #scores-table > span {
   color: blue;
 }

 .av-centered {
   text-align: center !important;
   cursor: default !important;
 }

 .el-collapse-item__header {
   text-align: left;
 }

 figcaption {
   font-size: 24px;
   text-align: center;
 }

 figcaption a {
   font-size: 20px;
   text-align: center;
 }

 .grey-bg {
   background-color: #f9fafc;
 }

 .no-selection {
   height: 500px;
   display: flex;
   justify-content: center;
   font-size: 18px;
 }

 #annot-img-collapse .el-collapse-item__header>span {
   display: inline-flex;
 }


 .main-ion-image-container {
   display: flex;
   flex-direction: row;
   justify-content: center;
 }

 .colorbar-container {
   display: flex;
   flex-direction: column;
   justify-content: flex-end;
   padding-left: 10px;
   padding-bottom: 6px;
 }

 #isotope-plot-container text {
    font-family: "Roboto" !important;
 }

</style>
