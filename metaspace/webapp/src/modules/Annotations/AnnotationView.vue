<template>
  <el-row>
    <el-collapse id="annot-content" class="border-0" :model-value="activeSections" @change="onSectionsChange">
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
                <molecular-formula class="sf-big text-2xl" :ion="annotation.ion" />
              </candidate-molecules-popover>
              <copy-button class="ml-1" :text="getParsedFormula(annotation.ion)"> Copy ion to clipboard </copy-button>
            </div>
            <span class="text-2xl flex items-baseline">
              {{ annotation.mz.toFixed(4) }}
              <span class="ml-1 text-gray-700 text-sm">m/z</span>
              <copy-button class="self-start" :text="annotation.mz.toFixed(4)"> Copy m/z to clipboard </copy-button>
            </span>
            <share-link class="av-icon" :route="permalinkHref" :annotation="annotation" />
            <el-popover
              v-if="!annotation.dataset.isPublic"
              class="av-icon cursor-help"
              trigger="hover"
              placement="bottom"
              @show="loadVisibility"
            >
              <template v-slot:reference>
                <stateful-icon class="h-6 w-6" inverse>
                  <lock-svg />
                </stateful-icon>
              </template>
              <p v-loading="visibilityText == null" class="m-0 max-w-measure-2 leading-5 text-left">
                {{ visibilityText }}
              </p>
            </el-popover>

            <el-popover v-if="showColoc" class="av-icon" trigger="hover" placement="bottom">
              <template v-slot:reference>
                <button class="button-reset block" @click.stop="filterColocSamples">
                  <stateful-icon class="h-6 w-6" inverse>
                    <location-pin-svg />
                  </stateful-icon>
                </button>
              </template>
              <div>Show representative spatial patterns for dataset</div>
            </el-popover>

            <copy-button is-id :text="annotation.dataset.id" custom-class="dataset-id-copy">
              Copy dataset id to clipboard
            </copy-button>
          </div>
          <mode-button v-if="multiImagesEnabled" class="absolute right-0 bottom-0 mr-2 mb-2" @multi="filterByDataset" />
        </div>
      </div>

      <el-collapse-item id="annot-img-collapse" name="images" class="el-collapse-item--no-padding">
        <template v-slot:title>
          <component
            :is="metadataDependentComponent('main-image-header')"
            :annotation="annotation"
            :has-optical-image="bestOpticalImage != null"
            :show-optical-image="showOpticalImage"
            :reset-viewport="resetViewport"
            :toggle-optical-image="toggleOpticalImage"
            :is-active="activeSections.includes('images')"
            @scaleBarColorChange="setScaleBarColor"
          />
        </template>
        <component
          :is-hidden="!activeSections.includes('images')"
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
          @opacity="handleOpacityChange"
          @roi-coordinate="addRoiCoordinate"
          @opticalOpacity="handleOpticalOpacityChange"
        />
      </el-collapse-item>

      <el-collapse-item name="compounds">
        <template v-slot:title>
          <div class="w-full" style="display: flex; align-items: center">
            <!-- <div class="mr-2">Molecules ({{ annotation.countPossibleCompounds }})</div> -->
            <div class="mr-2">Molecules</div>
            <ambiguity-alert :isomers="annotation.isomers" :isobars="annotation.isobars" />
          </div>
        </template>
        <related-molecules
          v-if="annotation && activeSections.indexOf('compounds') !== -1"
          query="isomers"
          :annotation="annotation"
          :database-id="store.getters.filter.database"
        />
      </el-collapse-item>

      <el-collapse-item v-if="showColoc" name="colocalized">
        <template v-slot:title>
          <div class="w-full" style="display: flex; align-items: center; padding-right: 10px">
            <span> Colocalized annotations </span>

            <el-popover placement="bottom" trigger="click">
              <colocalization-settings />
              <template #reference>
                <button class="button-reset av-icon-button" @click.stop="">
                  <el-icon id="colocalization-settings-icon" style="font-size: 20px; vertical-align: middle">
                    <Setting />
                  </el-icon>
                </button>
              </template>
            </el-popover>
            <button class="button-reset av-icon-button" title="Show in list" @click.stop="filterColocalized">
              <filter-icon class="w-5 h-5 fill-current" />
            </button>
          </div>
        </template>

        <component
          :is="metadataDependentComponent('related-annotations')"
          v-if="activeSections.indexOf('colocalized') !== -1"
          query="colocalized"
          :annotation="annotation"
          :database-id="store.getters.filter.database"
          :acquisition-geometry="msAcqGeometry"
          :image-loader-settings="imageLoaderSettings"
          :scale-type="scaleType"
        />
      </el-collapse-item>

      <el-collapse-item name="scores" class="tour-diagnostic-tab">
        <template v-slot:title>
          <div class="w-full" style="display: flex; align-items: center">
            <div class="mr-2 tour-diagnostic-title">Diagnostics</div>
          </div>
        </template>
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

      <el-collapse-item name="metadata">
        <template v-slot:title>
          <div class="w-full" style="display: flex; align-items: center">
            <div class="mr-2">Metadata</div>
          </div>
        </template>
        <dataset-info
          v-if="activeSections.includes('metadata')"
          :metadata="metadata"
          :additional-settings="additionalSettings"
          :current-user="currentUser"
        />
      </el-collapse-item>
    </el-collapse>
  </el-row>
</template>

<script lang="ts" src="./AnnotationView.ts" />

<style scoped lang="scss">
::v-deep(.av-header-items) {
  display: flex;
  justify-content: center;
  text-align: center !important;
  cursor: default !important;
  font-size: 24px;
  align-items: baseline;

  > * + * {
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
  border: 0;
}

#annot-content ::v-deep(.el-collapse-item__header) {
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

#annot-img-collapse .el-collapse-item__header > span {
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

.dataset-id-copy {
  padding-top: 4px;
}
</style>
