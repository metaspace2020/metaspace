<template>
  <span id="ion-image-settings">
    <el-form label-position="top">
      <el-form-item
        label="Intensity scaling"
        data-feature-anchor="ion-image-color-scale"
      >
        <el-select
          :value="scaleType"
          style="width: 300px;"
          @input="onScaleTypeChange"
        >
          <el-option
            value="linear"
            label="Linear"
          />
          <el-option
            value="linear-full"
            label="Linear (without hot-spot removal)"
          />
          <el-option
            value="log"
            label="Logarithmic"
          />
          <el-option
            value="log-full"
            label="Logarithmic (without outlier clipping)"
          />
          <el-option
            value="hist"
            label="Equalized histogram"
          />
        </el-select>
      </el-form-item>
      <el-form-item
        v-if="showIntensityTemplate"
        data-feature-anchor="global-intensity-lock"
      >
        <el-popover
          slot="label"
          trigger="hover"
          placement="right"
        >
          <div slot="reference">
            Intensity lock
            <new-feature-badge feature-key="template-intensity-lock">
              <i class="el-icon-question cursor-pointer ml-1" />
            </new-feature-badge>
          </div>
          <div class="max-w-xs">
            Apply intensities range of one dataset to all other datasets.
          </div>
        </el-popover>
        <el-select
          :value="selectedTemplate"
          style="width: 300px;"
          clearable
          placeholder="Choose the template dataset"
          @input="onTemplateChange"
          @clear="onTemplateChange"
        >
          <el-option
            v-for="item in lockTemplateOptions"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          >
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item
        v-if="!hideNormalization"
        label=""
      >
        <el-checkbox
          :value="normalization"
          @change="onNormalizationChange"
        >
          <div class="font-thin flex flex-row items-center">
            TIC normalization
            <el-popover
              trigger="hover"
              placement="right"
            >
              <div slot="reference">
                <i class="el-icon-question cursor-pointer ml-1" />
              </div>
              <div class="max-w-xs">
                This ion image was TIC-normalized.
                The intensities were divided by the TIC value and then scaled by multiplying by 1e+6.
              </div>
            </el-popover>
          </div>
        </el-checkbox>
      </el-form-item>
      <el-form-item label="Colormap">
        <el-select
          :value="colormap"
          style="width: 150px;"
          @input="onColormapChange"
        >
          <el-option-group>
            <el-option
              v-for="scale in availableScales"
              :key="scale"
              class="flex items-center pr-5 py-2"
              :value="scale"
              :label="scale"
            >
              <color-bar
                class="h-full w-full"
                :map="scale"
                horizontal
              />
            </el-option>
          </el-option-group>
          <el-option-group label="Inverted">
            <el-option
              v-for="scale in availableScales"
              :key="'-' + scale"
              class="flex items-center pr-5 py-2"
              :value="'-' + scale"
              :label="scale"
            >
              <color-bar
                class="h-full w-full"
                :map="'-' + scale"
                horizontal
              />
            </el-option>
          </el-option-group>
        </el-select>
      </el-form-item>
      <el-form-item label="Scale bar color">
        <el-select
          :value="pickedColor"
          style="width: 150px;"
          @input="onScaleBarColorChange"
        >
          <el-option
            v-for="color in paletteColors"
            :key="color.code"
            :value="color.code"
            :label="color.colorName"
          >
            <div :style="{position: 'relative', background: color.bgColor, height: '50px'}">
              <scale-bar
                :x-scale="8"
                :y-scale="8"
                :scale-bar-color="color.code"
              />
            </div>
          </el-option>
          <el-option
            value="hidden"
            label="Hidden"
          />
        </el-select>
      </el-form-item>
    </el-form>
  </span>
</template>

<script lang="ts">
import Vue from 'vue'
import ColorBar from './Colorbar.vue'
import { Component, Prop } from 'vue-property-decorator'
import { ScaleType } from '../../../../lib/ionImageRendering'
import ScaleBar from '../../../../components/ScaleBar.vue'
import NewFeatureBadge, { hideFeatureBadge } from '../../../../components/NewFeatureBadge'

 interface colorObjType {
   code: string,
   bgColor: string,
   colorName: string
 }

 @Component({
   name: 'ion-image-setting',
   components: { ColorBar, ScaleBar, NewFeatureBadge },
 })
export default class IonImageSettings extends Vue {
   @Prop({ type: String })
   defaultColormap: string | undefined;

   @Prop({ type: String })
   defaultScaleType: string | undefined;

   @Prop({ type: String })
   defaultScaleBarColor: string | undefined;

   @Prop({ type: Boolean })
   defaultNormalization: boolean | undefined;

   @Prop({ type: Boolean })
   hideNormalization: boolean | undefined;

   @Prop({ type: String })
   defaultLockTemplate: string | undefined;

   @Prop({ type: Array })
   lockTemplateOptions: any[] | undefined;

   @Prop({ type: Boolean })
   showIntensityTemplate: boolean | undefined

   availableScales: string[] = ['Viridis', 'Cividis', 'Hot', 'YlGnBu', 'Portland', 'Greys', 'Inferno', 'Turbo'];
   paletteColors: colorObjType[] = [{
     code: '#000000',
     bgColor: 'transparent',
     colorName: 'Black',
   }, {
     code: '#999999',
     bgColor: 'transparent',
     colorName: 'Gray',
   }, {
     code: '#FFFFFF',
     bgColor: '#CCCCCC',
     colorName: 'White',
   }];

   pickedColor: string = this.defaultScaleBarColor ? this.defaultScaleBarColor : this.paletteColors[0].code;

   get colormap() {
     return this.defaultColormap ? this.defaultColormap : this.$store.getters.settings.annotationView.colormap
   }

   get scaleType() {
     return this.defaultScaleType ? this.defaultScaleType : this.$store.getters.settings.annotationView.scaleType
   }

   get normalization() {
     return this.defaultNormalization ? this.defaultNormalization
       : this.$store.getters.settings.annotationView.normalization
   }

   get selectedTemplate() {
     return this.defaultLockTemplate ? this.defaultLockTemplate
       : this.$store.getters.settings.annotationView.lockTemplate
   }

   scaleBarColors(color: string): string {
     let cssBaseRule = `width: 100px; height: 20px; margin: 2px auto; background-color:${color};`
     if (color === '#FFFFFF') {
       cssBaseRule = cssBaseRule + 'outline: 1px solid gray'
     }
     return cssBaseRule
   }

   onColormapChange(selection: string) {
     this.$store.commit('setColormap', selection)
     this.$emit('colormapChange', selection)
   }

   onScaleTypeChange(scaleType: ScaleType) {
     this.$store.commit('setScaleType', scaleType)
     this.$emit('scaleTypeChange', scaleType)
   }

   onScaleBarColorChange(c: string) {
     this.pickedColor = c
     this.$emit('scaleBarColorChange', c === 'hidden' ? null : c)
   }

   onNormalizationChange(value: boolean) {
     this.$store.commit('setNormalization', value)
     this.$emit('normalizationChange', value)
   }

   onTemplateChange(dsId: string) {
     this.$store.commit('setLockTemplate', dsId)
     this.$emit('templateChange', dsId)
     hideFeatureBadge('template-intensity-lock')
   }
}
</script>

<style>
 #ion-image-settings {
   display: inline-flex;
   flex-direction: column;
   justify-content: center;
 }

 #ion-image-settings > .el-select {
   display: inline-flex;
 }

  #ion-image-settings > .el-form--label-top .el-form-item__label {
    padding: 0;
  }

 .el-badge__content.is-fixed{
   right: 0;
   top: 10px;
 }
</style>
