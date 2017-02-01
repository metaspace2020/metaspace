<template>
  <el-row>
    <router-view></router-view>
    <el-col v-if="annotation">
      <el-collapse id="annot-content" v-model="activeSections">

        <div class="el-collapse-item grey-bg">
          <div class="el-collapse-item__header av-centered grey-bg">
            <span class="sf-big" v-html="formattedSumFormula"> </span>
            <span class="mz-big">{{ annotation.mz.toFixed(4) }}</span>
          </div>
        </div>

        <el-collapse-item title="m/z image" name="images" class="av-centered">
          <div style="margin-top: 10px;">
            <image-loader :src="annotation.ionImage.url"
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
          <table id="details-table">
            <tr>
              <td>MSM score</td>
              <td> {{ annotation.msmScore.toFixed(3) }} </td>
            </tr>
            <tr>
              <td> &rho;<sub>spatial</sub></td>
              <td>{{ annotation.rhoSpatial.toFixed(3) }} </td>
            </tr>
            <tr>
              <td> &rho;<sub>spectral</sub></td>
              <td>{{ annotation.rhoSpectral.toFixed(3) }} </td>
            </tr>
            <tr>
              <td> &rho;<sub>chaos</sub></td>
              <td>{{ annotation.rhoChaos.toFixed(3) }} </td>
            </tr>
          </table>
          <div id="isotope-images-container">
            <div class="small-peak-image" v-for="img in annotation.isotopeImages">
            {{ img.mz.toFixed(4) }}<br/>
            <img :src="img.url"
                class="ion-image"/>
            </div>
          </div>
        </el-collapse-item>
        <el-collapse-item title="Dataset info" name="metadata">
          <dataset-info :metadata="JSON.parse(annotation.dataset.metadataJson)"
                        :expandedKeys="['Sample information', 'Submitted by', 'Submitter']">
          </dataset-info>
        </el-collapse-item>
      </el-collapse>
    </el-col>

    <el-col class="av-centered no-selection" v-else>
      <div style="align-self: center;">
        Select an annotation by clicking the table
      </div>
    </el-col>
  </el-row>
</template>

<script>
 import { renderSumFormula  } from '../util.js';
 import DatasetInfo from './DatasetInfo.vue';
 import ImageLoader from './ImageLoader.vue';

 export default {
   name: 'annotation-view',
   props: ['annotation'],
   data() {
     return {
       activeSections: ["images"]
     };
   },
   computed: {
     formattedSumFormula() {
       if (!this.annotation) return '';
       const { sumFormula, adduct, dataset } = this.annotation;
       return renderSumFormula(sumFormula, adduct, dataset.polarity);
     },

     compoundsTabLabel() {
       if (!this.annotation) return '';
       return "Compounds (" + this.annotation.possibleCompounds.length + ")";
     }
   },

   components: {
     DatasetInfo,
     ImageLoader
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

 .principal-peak-image > img {
   min-height: 500px;
   max-width: 100%;
   object-fit: contain;
 }

 .small-peak-image {
   display: inline-block;
   font-size: 1rem;
   vertical-align: top;
   max-width: 45%;
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

 #details-table {
   border-collapse: collapse;
 }

 #details-table td {
   border: 1px solid black;
   padding: 5px;
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

</style>
