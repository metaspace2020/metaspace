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
            <span>m/z image</span>
            <span style="display: inline-flex; padding: 0px 0px 0px 30px;">
              <span>
                <colorbar style="padding: 7px; height: 28px;" :map="colormap"></colorbar>
              </span>
              <span id="colormap-select-span" @click="$event.stopPropagation()">
                <el-select :value="colormap" size="small" style="width: 120px;" title="Colormap"
                           @input="onColormapChange">
                  <el-option v-for="scale in availableScales"
                             :value="scale" :label="scale">
                    <colorbar style="height: 20px" :map="scale" :title="scale"></colorbar>
                  </el-option>
                </el-select>
              </span>
            </span>
          </span>
          <div style="margin-top: 10px;">
            <image-loader :src="annotation.ionImage.url"
                          :colormap="colormap"
                          class="ion-image principal-peak-image">
            </image-loader>
          </div>
        </el-collapse-item>

        <el-collapse-item :title="compoundsTabLabel" name="compounds">
          <div id="compound-list">
            <div class="compound" v-for="compound in annotation.possibleCompounds">
              <el-popover placement="left" trigger="click">
                <img :src="compound.imageURL" class="compound-thumbnail"
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
                    <img :src="compound.imageURL" class="compound-image"/>
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
            <el-col :xs="24" :sm="12" :md="12" :lg="6" v-for="img in annotation.isotopeImages">
              <div class="small-peak-image">
                {{ img.mz.toFixed(4) }}<br/>
                <img :src="img.url"
                     class="ion-image"/>
              </div>
            </el-col>
          </el-row>
          <el-row>
            <isotope-pattern-plot :data="JSON.parse(peakChartData)">
            </isotope-pattern-plot>
          </el-row>
        </el-collapse-item>
        <el-collapse-item title="Dataset info" name="metadata">
          <dataset-info :metadata="JSON.parse(annotation.dataset.metadataJson)"
                        :expandedKeys="['Sample information', 'Submitted by', 'Submitter']">
          </dataset-info>
        </el-collapse-item>
      </el-collapse>
    </el-col>
  </el-row>
</template>

<script>
 import { renderMolFormula  } from '../util.js';
 import DatasetInfo from './DatasetInfo.vue';
 import ImageLoader from './ImageLoader.vue';
 import IsotopePatternPlot from './IsotopePatternPlot.vue';
 import Colorbar from './Colorbar.vue';
 import gql from 'graphql-tag';

 export default {
   name: 'annotation-view',
   props: ['annotation'],
   data() {
     return {
       availableScales: ["Viridis", "Hot", "Greys", "Portland", "YlGnBl"]
     };
   },
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
       query: gql`query GetAnnotation($id: String!) {
         annotation(id: $id) {
           peakChartData
         }
       }`,
       update: data => data.annotation.peakChartData,
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
     },

     onColormapChange(selection) {
       this.$store.commit('setColormap', selection);
     }
   },

   components: {
     DatasetInfo,
     ImageLoader,
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

 .small-peak-image img {
   min-height: 250px;
   max-width: 95%;
   object-fit: contain;
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

 #colormap-select-span {
   display: inline-flex;
   flex-direction: column;
   justify-content: center;
   height: 43px;
 }

 #colormap-select-span > .el-select {
   display: inline-flex;
 }

</style>
