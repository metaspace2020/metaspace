<template>
  <el-row>
    <el-col>
      <el-collapse id="annot-content" :value="activeSections"
                   @change="onSectionsChange">

        <div class="el-collapse-item grey-bg">
          <div class="el-collapse-item__header av-header grey-bg">

            <candidate-molecules-popover
              placement="bottom"
              :possibleCompounds="annotation.possibleCompounds"
              :isomers="showIsomers ? annotation.isomers : []"
            >
              <span class="sf-big" v-html="formattedMolFormula" />
            </candidate-molecules-popover>

            <span class="mz-big">{{ annotation.mz.toFixed(4) }}</span>
            <el-popover trigger="hover" placement="bottom">
              <router-link slot="reference"
                           target="_blank"
                           :to="permalinkHref">
                <img src="../../assets/share-icon.png" class="av-icon">
              </router-link>
              <div>Link to this annotation (opens in a new tab)</div>
            </el-popover>

            <el-popover v-if="!annotation.dataset.isPublic" trigger="hover" placement="bottom" @show="loadVisibility">
              <img slot="reference" src="../../assets/padlock-icon.svg" class="av-icon">
              <div v-loading="visibilityText == null">
                {{visibilityText}}
              </div>
            </el-popover>


            <el-popover v-if="showColoc" trigger="hover" placement="bottom">
              <img slot="reference" src="../../assets/map-icon.svg" class="av-icon av-icon-link" @click.stop="filterColocSamples">
              <div>Show representative spatial patterns for dataset</div>
            </el-popover>
          </div>
        </div>

        <el-collapse-item name="images" id="annot-img-collapse" class="av-centered">
          <component :is="metadataDependentComponent('main-image-header')"
                     :annotation="annotation"
                     :hasOpticalImage="bestOpticalImage != null"
                     :showOpticalImage="showOpticalImage"
                     :resetViewport="resetViewport"
                     :toggleOpticalImage="toggleOpticalImage"
                     @scaleBarColorChange="setScaleBarColor"
                     slot="title">
          </component>
          <component :is="metadataDependentComponent('main-image')"
                     :annotation="annotation"
                     :colormap="colormap"
                     :opacity="opacity"
                     :imagePosition="imagePosition"
                     :imageLoaderSettings="imageLoaderSettings"
                     :onImageMove="onImageMove"
                     :acquisitionGeometry="msAcqGeometry"
                     :pixelSizeX="pixelSizeX"
                     :pixelSizeY="pixelSizeY"
                     :scaleBarColor="scaleBarColor"
                     :scaleType="scaleType"
                     @opacityInput="newVal => opacity = newVal">
          </component>
        </el-collapse-item>

        <el-collapse-item name="compounds">
          <div slot="title" style="display: flex; align-items: center">
            <div>Molecules ({{annotation.countPossibleCompounds}})</div>
            <isomers-alert v-if="showIsomers && annotation.isomers.length > 0" :isomers="annotation.isomers" />
          </div>
          <related-molecules v-if="annotation && activeSections.indexOf('compounds') !== -1"
                             query="isomers"
                             :annotation="annotation"
                             :database="this.$store.getters.filter.database" />
        </el-collapse-item>

        <el-collapse-item v-if="showColoc" name="colocalized">
          <div slot="title" style="display: flex; align-items: center; padding-right: 10px">
            <span style="padding-right: 20px">
              Colocalized annotations
            </span>

            <el-popover placement="bottom" trigger="click">
              <colocalization-settings />
              <div slot="reference" @click.stop="">
                <i class="el-icon-setting" style="font-size: 20px; vertical-align: middle;"></i>
              </div>
            </el-popover>
            <img src="../../assets/filter-icon.svg"
                 title="Show in list"
                 class="av-icon-button"
                 @click.stop="filterColocalized"
            />
          </div>
          <component v-if="activeSections.indexOf('colocalized') !== -1"
                     :is="metadataDependentComponent('related-annotations')"
                     query="colocalized"
                     :annotation="annotation"
                     :database="this.$store.getters.filter.database"
                     :acquisitionGeometry="msAcqGeometry"
                     :image-loader-settings="imageLoaderSettings"
                     :scaleType="scaleType">
          </component>
        </el-collapse-item>

        <el-collapse-item title="Other adducts" name="adducts">
          <component v-if="activeSections.indexOf('adducts') !== -1"
                     :is="metadataDependentComponent('related-annotations')"
                     query="allAdducts"
                     :annotation="annotation"
                     :database="this.$store.getters.filter.database"
                     :acquisitionGeometry="msAcqGeometry"
                     :image-loader-settings="imageLoaderSettings"
                     :scaleType="scaleType">
          </component>
        </el-collapse-item>

        <el-collapse-item title="Diagnostics" name="scores" class="tour-diagnostic-tab">
          <component v-if="activeSections.indexOf('scores') !== -1"
                     :is="metadataDependentComponent('diagnostics')"
                     :annotation="annotation"
                     :colormap="colormap"
                     :imageLoaderSettings="imageLoaderSettings"
                     :scaleType="scaleType"
                     :peakChartData="peakChartData"
                     :acquisitionGeometry="msAcqGeometry">
          </component>
        </el-collapse-item>

        <el-collapse-item title="Metadata" name="metadata">
          <dataset-info :metadata="metadata" :currentUser="currentUser" />
        </el-collapse-item>
      </el-collapse>
    </el-col>
  </el-row>
</template>

<script lang="ts">
 import AnnotationView from './AnnotationView';
 export default AnnotationView;
</script>

<style scoped lang="scss">
  /deep/ .av-header {
    justify-content: center;
    text-align: center !important;
    cursor: default !important;
    font-size: 24px;
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
      font-size: 24px;
      text-shadow : 0 0 0 #000;
    }

    .mz-big {
      font-size: 24px;
      padding: 0 4px;
    }
  }

 #annot-content {
   width: 100%;
 }

 #annot-content /deep/ .el-collapse-item__header {
   text-align: left;

   .el-collapse-item__arrow {
     // WORKAROUND: A new version of ElementUI changed the position of the arrow in a way that doesn't look good
     // with our existing components: https://github.com/ElemeFE/element/issues/14142
     order: -1;
   }
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

  .av-icon-button {
    display: inline-block;
    box-sizing: border-box;
    margin-left: 20px;
    width: 20px;
    height: 20px;
    font-size: 24px;
  }

  .av-icon-link {
    cursor: pointer;
  }

</style>
