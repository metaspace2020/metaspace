<template>
  <span id="ion-image-settings">
    <el-form>
      <el-form-item label="Colormap">
        <el-select :value="colormap"
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
     }
   },
   data() {
     return {
       availableScales: ["Viridis", "Hot", "Greys", "Portland", "YlGnBu"]
     };
   },
   methods: {
     onColormapChange(selection) {
       this.$store.commit('setColormap', selection);
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
