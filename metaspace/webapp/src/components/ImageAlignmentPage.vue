<template>
  <div id="alignment-page">

    <div class="image-alignment-top">
      <div class="image-alignment-header">
        Align ion images to the optical image and press 'Submit' button to save the transformation and upload the image to the server.
      </div>

      <div class="image-alignment-settings">
        <div>
          <label class="optical-image-select el-button">
            <input type="file"
                  style="display: none;"
                  @change="onFileChange"
                  accept=".png, .jpg, .jpeg"/>
              Select optical image
          </label>

          <div style="padding: 3px; font-size: small;">
          {{ opticalImageFilename }}
          </div>

          <div class="el-upload__tip" slot="tip">
            JPEG/PNG file less than {{ limitMB }}MB in size
          </div>
        </div>

        <div class="sliders-box">
          IMS image opacity:
          <el-slider :min=0 :max=1 :step=0.01 v-model="annotImageOpacity">
          </el-slider>

          Optical image padding, px:
          <el-slider :min=0 :max=500 :step=10 v-model="padding">
          </el-slider>
        </div>

        <div class="annotation-selection">
          <el-form :inline="true">
            <el-form-item label="Angle (°):" style="margin-bottom:5px;">
              <el-input-number :min=-180 :max=180 :step=1 v-model="angle" size="small">
              </el-input-number>
            </el-form-item>
          </el-form>

          <span style="font-size: 14px; margin-bottom: 5px;" >Annotation:</span>
          <el-pagination
              layout="prev,slot,next"
              :total="this.annotations ? this.annotations.length : 0"
              :page-size=1
              @current-change="updateIndex">
            <div class="annotation-short-info" v-html="currentSumFormula"></div>
          </el-pagination>
        </div>

        <div class="optical-image-submit">
          <div style="display: inline-block;">
            <el-button @click="reset"
                       v-show="opticalImgUrl"
                       style="margin-bottom: 10px;">
              Reset
            </el-button>

            <el-button type="primary"
                       @click="submit"
                       :disabled="!opticalImgUrl">
              Submit
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <image-aligner
        v-if="opticalImgUrl"
        ref="aligner"
        style="position:relative;top:200px;z-index:1;"
        :annotImageOpacity="annotImageOpacity"
        :opticalSrc="opticalImgUrl"
        :padding="padding"
        :rotationAngleDegrees="angle"
        :massSpecSrc="massSpecSrc">
    </image-aligner>
  </div>
</template>

<script>
 import ImageAligner from './ImageAligner.vue';
 import {annotationListQuery} from '../api/annotation.js';
 import {renderMolFormula} from '../util.js';

 export default {
   name: 'image-alignment-page',
   components: {
     ImageAligner
   },

   props: {
     limitMB: {
       type: Number,
       default: 25
     }
   },

   data() {
     return {
       annotImageOpacity: 1,
       annotationIndex: 0,
       file: null,
       opticalImgUrl: null,
       padding: 100,
       angle: 0
     }
   },

   apollo: {
     annotations: {
       query: annotationListQuery,
       variables() {
         return {
           filter: {fdrLevel: 0.5},
           dFilter: {ids: this.datasetId},
           offset: 0,
           limit: 100,
           query: '',
           orderBy: 'ORDER_BY_MSM',
           sortingOrder: 'DESCENDING'
         };
       },
       update: data => data.allAnnotations
     }
   },

   computed: {
     datasetId() {
       return this.$store.state.route.params.dataset_id;
     },

     currentAnnotation() {
       if (!this.annotations || this.annotations.length == 0)
         return null;
       return this.annotations[this.annotationIndex];
     },

     massSpecSrc() {
       const url = this.currentAnnotation ? this.currentAnnotation.isotopeImages[0].url : null;
       return url ? 'http://annotate.metasp.eu' + url : null;
     },

     currentSumFormula() {
       if (!this.annotations)
         return 'loading...';
       if (this.annotations.length == 0)
         return 'no results';
       const {sumFormula, adduct, dataset} = this.currentAnnotation;
       return renderMolFormula(sumFormula, adduct, dataset.polarity);
     },

     opticalImageFilename() {
       return this.file ? this.file.name : '';
     }
   },
   methods: {
     onFileChange(event) {
       const file = event.target.files[0];

       if (!file)
         return;

       if (file.size > this.limitMB * 1024 * 1024) {
         this.$message({
           type: 'error',
           message: `The file exceeds ${this.limitMB} MB limit`
         });
         return;
       }

       window.URL.revokeObjectURL(this.opticalImgUrl);
       this.file = file;
       this.opticalImgUrl = window.URL.createObjectURL(this.file);
     },
     updateIndex(newIdx) {
       this.annotationIndex = newIdx - 1;
     },
     submit() {
       // TODO
       console.log(this.$refs.aligner.getNormalizedTransform());
     },
     reset() {
       this.$refs.aligner.reset();
       this.angle = 0;
     }
   }
 }
</script>

<style>

 .image-alignment-header {
   text-align: center;
   width: 100%;
   font-size: 14px;
   margin-bottom: 10px;
   padding: 10px;
   border-bottom: dotted lightblue 1px;
 }

 .image-alignment-settings {
   margin-bottom: 20px;
   padding: 10px;
   display: flex;
   flex-direction: row;
   justify-content: space-around;
 }

 .image-alignment-top {
   position: fixed;
   left: 0px;
   top: 62px;
   z-index: 500;
   width: 100%;
   background-color: white;
 }

 #alignment-page {
   margin: 20px;
 }

 .sliders-box {
   min-width: 150px;
   margin: 0px 20px;
   padding: 0px 20px;
   border-left: solid #eef 2px;
   font-size: 14px;
 }

 .annotation-short-info {
   display: inline-block;
   line-height: 23px;
   border-left: solid lightgrey 1px;
   border-right: solid lightgrey 1px;
   padding: 0px 10px;
   min-width: 150px;
   text-align: center;
 }

 .optical-image-submit {
   margin-left: 30px;
 }

 .optical-image-submit, .annotation-selection {
   display: flex;
   flex-direction: column;
   justify-content: center;
 }
</style>
