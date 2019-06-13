<template>
  <span id="ion-image-settings">
    <el-form>
      <el-form-item label="Colormap">
        <el-select :value="colormapName"
                   style="width: 120px;"
                   title="Colormap"
                   @input="onColormapChange">
          <el-option v-for="scale in availableScales"
                     :value="scale" :label="scale" :key="scale">
            <color-bar direction="right"
                      style="width: 100px; height: 20px;"
                      :map="scale"></color-bar>
          </el-option>
        </el-select>
        <el-form-item label="Color scale" data-feature-anchor="ion-image-color-scale">
          <el-select :value="scaleType"
                     style="width: 120px;"
                     title="Color scale"
                     @input="onScaleTypeChange">
            <el-option value="linear" label="Linear" />
            <el-option value="log" label="Logarithmic" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-checkbox :checked="inverted" @input="onInvertChange">Invert</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-checkbox :checked="hotspotThreshold !== 'none'" @change="onHotspotThresholdChange">Hotspot clipping</el-checkbox>
        </el-form-item>
      </el-form-item>
      <el-form-item label="Scale bar color">
        <el-select :value="pickedColor"
                   style="width: 120px;"
                   title="Scale_bar_color"
                   @input="handlerClick">
          <el-option v-for="color in paletteColors"
                     :value="color.code" :label="color.colorName" :key="color.code">
              <div :style="scaleBarColors(color.code)"></div>
          </el-option>
        </el-select>
        <el-form-item>
          <el-checkbox @click="$event.stopPropagation()" @input="setBarVisibility">Disable</el-checkbox>
        </el-form-item>
      </el-form-item>
    </el-form>
  </span>
</template>

<script lang="ts">
 import Vue from 'vue';
 import ColorBar from './Colorbar.vue';
 import { Component } from 'vue-property-decorator'
 import {ScaleType} from '../../../../lib/ionImageRendering';

 interface colorObjType {
   code: string,
   colorName: string
 }

 @Component({
   name: 'ion-image-setting',
   components: { ColorBar }
 })
 export default class IonImageSettings extends Vue {
   availableScales: string[] = ["Viridis", "Cividis", "Hot", "YlGnBu", "Portland", "Greys"];
   paletteColors: colorObjType[] = [{
     code: '#000000',
     colorName: "Black"
   }, {
     code: '#FFFFFF',
     colorName: 'White'
   }, {
     code: '#999999',
     colorName: "Gray"
   }];
   disableBar = false;
   pickedColor: string = this.paletteColors[0].code;

   get colormap() {
     return this.$store.getters.settings.annotationView.colormap;
   }

   get colormapName() {
     return this.colormap.replace('-', '');
   }

   get inverted() {
     return this.colormap[0] == '-';
   }

   get scaleType() {
     return this.$store.getters.settings.annotationView.scaleType;
   }

   get hotspotThreshold() {
     return this.$store.getters.settings.annotationView.hotspotThreshold;
   }

   scaleBarColors(color: string): string {
     let cssBaseRule = `width: 100px; height: 20px; margin: 2px auto; background-color:${color};`;
     if (color === '#FFFFFF') {
       cssBaseRule = cssBaseRule + 'outline: 1px solid gray';
     }
     return cssBaseRule
   }

   onColormapChange(selection: string) {
     this.$store.commit('setColormap', (this.inverted ? '-' : '') + selection);
   }

   onInvertChange(invert: any) {
     this.$store.commit('setColormap', (invert ? '-' : '') + this.colormapName);
   }

   onScaleTypeChange(scaleType: ScaleType) {
     this.$store.commit('setScaleType', scaleType);
   }

   onHotspotThresholdChange(enableHotspotClipping: boolean) {
     this.$store.commit('setHotspotThreshold', enableHotspotClipping ? null : 'none');
   }

   setBarVisibility() {
     this.disableBar = !this.disableBar;
     this.$emit('toggleScaleBar')
   }

   handlerClick(c: string) {
     this.pickedColor = c;
     let colorObj = this.paletteColors.find(el => {
       return el.code === c;
     });
     if (colorObj !== undefined) {
       this.$emit('colorInput', colorObj)
     }
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
</style>
