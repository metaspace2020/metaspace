<template>
  <el-row>
    <el-col>
      <el-collapse
        id="annot-content"
        class="border-0"
        :value="activeSections"
        @change="onSectionsChange"
      >
        <div class="el-collapse-item">
          <div class="el-collapse-item__header flex items-start justify-center relative cursor-auto">
            <div class="av-header-items">
              <div class="flex">
                <candidate-molecules-popover
                  placement="bottom"
                  :possible-compounds="annotation.possibleCompounds"
                  :isomers="annotation.isomers"
                  :isobars="annotation.isobars"
                >
                  <molecular-formula
                    class="sf-big text-2xl"
                    :ion="annotation.ion"
                  />
                </candidate-molecules-popover>
                <copy-button
                  class="ml-1"
                  :text="getParsedFormula(annotation.ion)"
                >
                  Copy ion to clipboard
                </copy-button>
              </div>
              <span class="text-2xl flex items-baseline">
                {{ annotation.mz.toFixed(4) }}
                <span class="ml-1 text-gray-700 text-sm">m/z</span>
                <copy-button
                  class="self-start"
                  :text="annotation.mz.toFixed(4)"
                >
                  Copy m/z to clipboard
                </copy-button>
              </span>
              <share-link
                class="av-icon"
                :route="permalinkHref"
                :annotation="annotation"
              />
              <el-popover
                v-if="!annotation.dataset.isPublic"
                class="av-icon cursor-help"
                trigger="hover"
                placement="bottom"
                @show="loadVisibility"
              >
                <stateful-icon
                  slot="reference"
                  class="h-6 w-6"
                  inverse
                >
                  <lock-svg />
                </stateful-icon>
                <p
                  v-loading="visibilityText == null"
                  class="m-0 max-w-measure-2 leading-5 text-left"
                >
                  {{ visibilityText }}
                </p>
              </el-popover>

              <el-popover
                v-if="showColoc"
                class="av-icon"
                trigger="hover"
                placement="bottom"
              >
                <button
                  slot="reference"
                  class="button-reset block"
                  @click.stop="filterColocSamples"
                >
                  <stateful-icon
                    class="h-6 w-6"
                    inverse
                  >
                    <location-pin-svg />
                  </stateful-icon>
                </button>
                <!-- <img
                  slot="reference"
                  src="../../assets/map-icon.svg"
                  class="av-icon av-icon-link"
                  @click.stop="filterColocSamples"
                > -->
                <div>Show representative spatial patterns for dataset</div>
              </el-popover>

              <copy-button
                is-id
                :text="annotation.dataset.id"
                custom-class="dataset-id-copy"
              >
                Copy dataset id to clipboard
              </copy-button>
            </div>
            <mode-button
              v-if="multiImagesEnabled"
              class="absolute right-0 bottom-0 mr-2 mb-2"
              @multi="filterByDataset"
            />
          </div>
        </div>

        <el-collapse-item
          id="annot-img-collapse"
          name="images"
          class="el-collapse-item--no-padding"
        >
          <component
            :is="metadataDependentComponent('main-image-header')"
            slot="title"
            :annotation="annotation"
            :has-optical-image="bestOpticalImage != null"
            :show-optical-image="showOpticalImage"
            :reset-viewport="resetViewport"
            :toggle-optical-image="toggleOpticalImage"
            :is-active="activeSections.includes('images')"
            @scaleBarColorChange="setScaleBarColor"
          />
          <component
            :is="metadataDependentComponent('main-image')"
            :annotation="annotation"
            :colormap="colormap"
            :opacity="opacity"
            :optical-opacity="opticalOpacity"
            :image-position="imagePosition"
            :image-loader-settings="imageLoaderSettings"
            :apply-image-move="onImageMove"
            :acquisition-geometry="msAcqGeometry"
            :pixel-size-x="pixelSizeX"
            :pixel-size-y="pixelSizeY"
            :scale-bar-color="scaleBarColor"
            :scale-type="scaleType"
            :tic-data="ticData ? normalization : null"
            @opacity="newVal => opacity = newVal"
            @roi-coordinate="addRoiCoordinate"
            @opticalOpacity="newVal => opticalOpacity = newVal"
          />
        </el-collapse-item>

        <el-collapse-item name="compounds">
          <div
            slot="title"
            style="display: flex; align-items: center"
          >
            <div>Molecules ({{ annotation.countPossibleCompounds }})</div>
            <ambiguity-alert
              :isomers="annotation.isomers"
              :isobars="annotation.isobars"
            />
          </div>
          <related-molecules
            v-if="annotation && activeSections.indexOf('compounds') !== -1"
            query="isomers"
            :annotation="annotation"
            :database-id="this.$store.getters.filter.database"
          />
        </el-collapse-item>

        <el-collapse-item
          v-if="showColoc"
          name="colocalized"
        >
          <div
            slot="title"
            style="display: flex; align-items: center; padding-right: 10px"
          >
            <span>
              Colocalized annotations
            </span>

            <el-popover
              placement="bottom"
              trigger="click"
            >
              <colocalization-settings />
              <button
                slot="reference"
                class="button-reset av-icon-button"
                @click.stop=""
              >
                <i
                  id="colocalization-settings-icon"
                  class="el-icon-setting"
                  style="font-size: 20px; vertical-align: middle;"
                />
              </button>
            </el-popover>
            <button
              class="button-reset av-icon-button"
              title="Show in list"
              @click.stop="filterColocalized"
            >
              <filter-icon class="w-5 h-5 fill-current" />
            </button>
          </div>
          <component
            :is="metadataDependentComponent('related-annotations')"
            v-if="activeSections.indexOf('colocalized') !== -1"
            query="colocalized"
            :annotation="annotation"
            :database-id="this.$store.getters.filter.database"
            :acquisition-geometry="msAcqGeometry"
            :image-loader-settings="imageLoaderSettings"
            :scale-type="scaleType"
          />
        </el-collapse-item>

        <el-collapse-item
          title="Other adducts"
          name="adducts"
        >
          <component
            :is="metadataDependentComponent('related-annotations')"
            v-if="activeSections.indexOf('adducts') !== -1"
            query="allAdducts"
            :annotation="annotation"
            :database-id="this.$store.getters.filter.database"
            :acquisition-geometry="msAcqGeometry"
            :image-loader-settings="imageLoaderSettings"
            :scale-type="scaleType"
          />
        </el-collapse-item>

        <el-collapse-item
          title="Diagnostics"
          name="scores"
          class="tour-diagnostic-tab"
        >
          <component
            :is="metadataDependentComponent('diagnostics')"
            v-if="activeSections.indexOf('scores') !== -1"
            :annotation="annotation"
            :colormap="colormap"
            :image-loader-settings="imageLoaderSettings"
            :scale-type="scaleType"
            :acquisition-geometry="msAcqGeometry"
          />
        </el-collapse-item>

        <el-collapse-item
          title="Metadata"
          name="metadata"
        >
          <dataset-info
            v-if="activeSections.includes('metadata')"
            :metadata="metadata"
            :additional-settings="additionalSettings"
            :current-user="currentUser"
          />
        </el-collapse-item>
      </el-collapse>
    </el-col>
  </el-row>
</template>

<script lang="ts" src="./AnnotationView.ts" />

<style scoped lang="scss">
  /deep/ .av-header-items {
    display: flex;
    justify-content: center;
    text-align: center !important;
    cursor: default !important;
    font-size: 24px;
    align-items: baseline;

    >*+* {
      margin-left: 16px;
    }

    .av-icon {
      @apply self-center mb-2 h-6;

      svg {
        display: block;
      }
    }

    .sf-big sub {
      @apply text-base;
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

 .no-selection {
   height: 500px;
   display: flex;
   justify-content: center;
   font-size: 18px;
 }

 #annot-img-collapse .el-collapse-item__header>span {
   display: inline-flex;
   align-items: center;
 }
</style>
<style>
  .av-icon-button {
    display: inline-block;
    box-sizing: border-box;
    margin-left: 16px;
    width: 24px;
    height: 24px;
    line-height: 1;
    cursor: pointer;
  }

  .av-icon-button img {
    max-height: 20px;
  }

  .av-icon-link {
    cursor: pointer;
  }

  .dataset-id-copy{
    padding-top: 4px;
  }
</style>
