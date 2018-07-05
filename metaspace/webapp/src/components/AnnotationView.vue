<template>
  <el-row>
    <el-col>
      <el-collapse id="annot-content" :value="activeSections"
                   @change="onSectionsChange">

        <div class="el-collapse-item grey-bg">
          <div class="el-collapse-item__header av-header grey-bg">
            <span class="sf-big" v-html="formattedMolFormula"> </span>
            <span class="mz-big">{{ annotation.mz.toFixed(4) }}</span>
            <el-popover trigger="hover" placement="bottom">
              <router-link slot="reference"
                           target="_blank"
                           :to="permalinkHref">
                <img src="../assets/share-icon.png" class="av-icon">
              </router-link>
              <div>Link to this annotation (opens in a new tab)</div>
            </el-popover>

            <el-popover v-if="!annotation.dataset.isPublic" trigger="hover" placement="bottom">
              <img slot="reference" src="../assets/padlock-icon.svg" class="av-icon">
              <div>This dataset's annotation results are not publicly visible</div>
            </el-popover>
          </div>
        </div>

        <el-collapse-item name="images" id="annot-img-collapse" class="av-centered">
          <component :is="metadataDependentComponent('main-image-header')"
                     :annotation="annotation"
                     :imageLoaderSettings="imageLoaderSettings"
                     :resetViewport="resetViewport"
                     :toggleOpticalImage="toggleOpticalImage"
                     slot="title">
          </component>
          <component :is="metadataDependentComponent('main-image')"
                     :annotation="annotation"
                     :colormap="colormap"
                     :colormapName="colormapName"
                     :opacity="opacity"
                     :imageLoaderSettings="imageLoaderSettings"
                     :onImageZoom="onImageZoom"
                     :onImageMove="onImageMove"
                     :acquisitionGeometry="msAcqGeometry"
                     @opacityInput="newVal => opacity = newVal">
          </component>
        </el-collapse-item>

        <el-collapse-item :title="compoundsTabLabel" name="compounds">
          <div id="compound-list">
            <div class="compound" v-for="(compound, idx) in annotation.possibleCompounds" :key="idx">
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
          <component v-if="activeSections.indexOf('scores') !== -1"
                     :is="metadataDependentComponent('diagnostics')"
                     :annotation="annotation"
                     :colormap="colormap"
                     :imageLoaderSettings="imageLoaderSettings"
                     :peakChartData="peakChartData"
                     :acquisitionGeometry="msAcqGeometry">
          </component>
        </el-collapse-item>

        <el-collapse-item title="Dataset info" name="metadata">
          <dataset-info :metadata="JSON.parse(annotation.dataset.metadataJson)"
                        :expandedKeys="['Sample information', 'Submitted by', 'Submitter']">
          </dataset-info>
        </el-collapse-item>

        <el-collapse-item title="Related annotations" name="adducts">
          <el-row style="font-size: 16px; text-align: center; margin: 10px auto;">
            <span>All adducts for this annotation in the same dataset</span>
          </el-row>
          <component v-if="activeSections.indexOf('adducts') !== -1"
                     :is="metadataDependentComponent('adducts-info')"
                     :annotation="annotation"
                     :database="this.$store.getters.filter.database"
                     :acquisitionGeometry="msAcqGeometry"
                     :image-loader-settings="imageLoaderSettings">
          </component>
        </el-collapse-item>
      </el-collapse>
    </el-col>
  </el-row>
</template>

<script lang="ts">
 import AnnotationView from './AnnotationView';
 export default AnnotationView;
</script>

<style lang="scss">
  .av-header {
    text-align: center !important;
    cursor: default !important;
    font: 24px 'Roboto', sans-serif;
    line-height: 40px;
    vertical-align: center;

    >*+* {
      margin-left: 8px;
      margin-right: 8px;
    }

    .av-icon {
      width: 20px;
      height: 20px;
    }

    .sf-big {
      font: 24px 'Roboto', sans-serif;
      text-shadow : 0 0 0 #000;
    }

    .mz-big {
      font: 24px 'Roboto';
      padding: 0 4px;
    }
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

</style>
