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
            <colorbar direction="right"
                      style="width: 100px; height: 20px;"
                      :map="scale"></colorbar>
          </el-option>
        </el-select>
        <el-form-item>
          <el-checkbox :checked="inverted" @input="onInvertChange">Invert</el-checkbox>
        </el-form-item>
      </el-form-item>
    </el-form>
  </span>
</template>

<script>
 import Colorbar from './Colorbar.vue';
 export default {
   components: {Colorbar},
   computed: {
     colormap() {
       return this.$store.getters.settings.annotationView.colormap;
     },
     colormapName() {
       return this.colormap.replace('-', '');
     },
     inverted() {
       return this.colormap[0] == '-';
     }
   },
   data() {
     return {
       availableScales: ["Viridis", "Cividis", "Hot", "YlGnBu", "Portland", "Greys"]
     };
   },
   methods: {
     onColormapChange(selection) {
       this.$store.commit('setColormap', (this.inverted ? '-' : '') + selection);
     },

     onInvertChange(invert) {
       this.$store.commit('setColormap', (invert ? '-' : '') + this.colormapName);
     }
   },
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
