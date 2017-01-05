<template>
  <el-row>
    <el-col v-if="annotation">
      <div class="av-centered av-heading">
        <span class="sf-big" v-html="formattedSumFormula"> </span>
        <span class="mz-big">{{ annotation.mz.toFixed(4) }}</span>
      </div>

      <el-collapse id="annot-content" v-model="activeSections">
        <el-collapse-item title="Ion images" name="images" class="av-centered">
          <el-radio v-model="showAllMzImages"
                    :label="0">Principal peak</el-radio>
          <el-radio v-model="showAllMzImages"
                    :label="1">All isotopes</el-radio>
          <div id="isotope-images-container" v-if="showAllMzImages">
            <div class="small-peak-image" v-for="img in annotation.isotopeImages">
            {{ img.mz.toFixed(4) }}<br/>
            <img :src="img.url"
                class="ion-image"/>
            </div>
          </div>
          <div v-else style="margin-top: 10px;">
            <img :src="annotation.ionImage.url"
                 class="ion-image principal-peak-image"/>
          </div>
        </el-collapse-item>
        <el-collapse-item :title="compoundsTabLabel" name="compounds">
        <div id="compound-list">
          <div class="compound" v-for="compound in annotation.possibleCompounds">
            <img :src="compound.imageURL" class="compound-thumbnail"/>
            <br/>
            {{ compound.name }}
          </li>
        </ul>
        </el-collapse-item>
        <el-collapse-item title="Scores" name="scores">
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
        </el-collapse-item>
        <el-collapse-item title="Dataset info" name="metadata">
          <dataset-info :metadata="JSON.parse(annotation.dataset.metadataJson)">
          </dataset-info>
        </el-collapse-item>
      </el-collapse>
    </el-col>
    <el-col class="av-centered" v-else>
      Select an annotation by clicking the table
    </el-col>
  </el-row>
</template>

<script>
 import { renderSumFormula  } from '../util.js';
 import DatasetInfo from './DatasetInfo.vue';

 export default {
   name: 'annotation-view',
   props: ['annotation'],
   data() {
     return {
       showAllMzImages: 0,
       activeSections: ["images"]
     };
   },
   computed: {
     formattedSumFormula() {
       const { sumFormula, adduct, dataset } = this.annotation;
       return renderSumFormula(sumFormula, adduct, dataset.polarity);
     },

     compoundsTabLabel() {
       return "Compounds (" + this.annotation.possibleCompounds.length + ")";
     }
   },

   components: {
     DatasetInfo
   }
 }
</script>

<style>
 .ion-image {
   image-rendering: pixelated;
   image-rendering: -moz-crisp-edges;
 }

 #isotope-images-container {
   margin: 0 auto;
   text-align: left;
   font-size: 0;
   margin-top: 10px;
 }

 .principal-peak-image {
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
   font: 28px/40px 'Arvo', serif;
 }

 .mz-big {
   font: 25px/40px 'Roboto';
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
   height: 180px;
   margin: 10px;
   text-align: center;
 }

 .compound-thumbnail {
   max-height: 200px;
 }

 #details-table {
   border-collapse: collapse;
 }

 #details-table td {
   border: 1px solid black;
   padding: 5px;
 }

 .av-centered {
   text-align: center;
 }

 .el-collapse-item__header {
   text-align: left;
 }

 .av-heading {
   margin-bottom: 20px;
 }
</style>
