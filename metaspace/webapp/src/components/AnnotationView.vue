<template>
  <el-row>
    <el-col>
      <el-collapse id="annot-content" :value="activeSections"
                   @change="onSectionsChange">

        <div class="el-collapse-item grey-bg">
          <div class="el-collapse-item__header av-centered grey-bg">
            <span class="sf-big" v-html="formattedMolFormula"> </span>
            <span class="mz-big">{{ annotation.mz.toFixed(4) }}</span>
            <span>
              <router-link target="_blank"
                           style="font-size: 20px"
                           title="Link to this annotation (opens in a new tab)"
                           :to="permalinkHref"><img src="../assets/share-icon.png" width="18px">
              </router-link>
            </span>
          </div>
        </div>

        <el-collapse-item name="images" id="annot-img-collapse" class="av-centered">
          <span slot="title">
            <span style="padding-right: 20px">
              Extracted ion chromatogram
            </span>
          </span>

          <el-row id="xic-plot-container">
            <xic-plot :intensityImgs="[annotation.isotopeImages[0]]"
                      :isotopeColors="[isotopeLegendItems[0].color]"
                      :acquisitionGeometry="msAcqGeometry"
                      :logIntensity="false">
            </xic-plot>
          </el-row>
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
            (&rho;<sub>chromatography</sub>) &times;
            <span>{{ annotation.rhoSpectral.toFixed(3) }}</span>
            (&rho;<sub>spectral</sub>) &times;
            <span>{{ annotation.rhoChaos.toFixed(3) }}</span>
            (&rho;<sub>chaos</sub>)
          </el-row>
          <el-row class="diagnostics-section-title">
            <span>Isotope XICs</span>
          </el-row>
          <el-row id="isotope-images-container">
            <xic-plot :intensityImgs="annotation.isotopeImages"
                      :isotopeColors="isotopeLegendItems.map(i => i.color)"
                      :acquisitionGeometry="msAcqGeometry"
                      :logIntensity="true">
            </xic-plot>
          </el-row>
          <el-row class="diagnostics-section-title">
            <span>Isotope integral intensity</span>
          </el-row>
          <el-row id="isotope-plot-container">
            <isotope-pattern-plot :data="peakChartData"
                                  :isotopeColors="isotopeLegendItems.map(i => i.color)"
                                  :theorColor="theorIntensityLegendItem.color"
                                  v-if="activeSections.indexOf('scores') !== -1">
            </isotope-pattern-plot>
          </el-row>
          <el-row id="diagnostics-plot-legend">
            <plot-legend :items="isotopeLegendItems.concat(theorIntensityLegendItem)">
            </plot-legend>
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
                        :database="this.$store.getters.filter.database"
                        :image-loader-settings="imageLoaderSettings">
          </adducts-info>
        </el-collapse-item>
      </el-collapse>
    </el-col>
  </el-row>
</template>

<script lang="ts">
 export * from './AnnotationView.ts';
</script>

<style>
 .ion-image > img, .small-peak-image img {
   image-rendering: pixelated;
   image-rendering: -moz-crisp-edges;
   -ms-interpolation-mode: nearest-neighbor;
 }

 #isotope-images-container {
   margin: 10px auto;
   text-align: center;
   font-size: 13px;
 }

 .diagnostics-section-title {
   margin: 10px auto;
   text-align: center;
   font-size: 16px;
 }

 #xic-plot-container {
   font-size: 1rem;
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

 .reset-image-icon, .show-optical-image-icon {
   width: 24px;
   padding-left: 20px;
   vertical-align: middle;
   cursor: pointer;
 }

 .png-icon-disabled {
   opacity: 0.3;
 }

 .annot-view__image-download {
   margin-top: 20px;
   cursor: pointer;
 }

</style>
