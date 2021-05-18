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
import { Component } from 'vue-property-decorator'
import { ScaleType } from '../../../../lib/ionImageRendering'
import ScaleBar from '../../../../components/ScaleBar.vue'

 interface colorObjType {
   code: string,
   bgColor: string,
   colorName: string
 }

 @Component({
   name: 'ion-image-setting',
   components: { ColorBar, ScaleBar },
 })
export default class IonImageSettings extends Vue {
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

   pickedColor: string = this.paletteColors[0].code;

   get colormap() {
     return this.$store.getters.settings.annotationView.colormap
   }

   get scaleType() {
     return this.$store.getters.settings.annotationView.scaleType
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
   }

   onScaleTypeChange(scaleType: ScaleType) {
     this.$store.commit('setScaleType', scaleType)
   }

   onScaleBarColorChange(c: string) {
     this.pickedColor = c
     this.$emit('scaleBarColorChange', c === 'hidden' ? null : c)
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
</style>
