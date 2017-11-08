<template>
  <div id="alignment-page">

    <div class="image-alignment-top">
      <div class="image-alignment-header" style="text-align: left">
        <h3 style="margin: 5px; align-content: left">Dataset: {{ datasetName }}</h3>
        <h4>Align the dataset with an optical image </h4>

        <div id="hints" v-if="showHints.status === true">
          <p>
            Follow three easy steps:
        </p><ol>
          <li> Select an optical image file </li>
          <li> Move the annotation ion image until it matches the optical image </li>
          <li> Press 'submit' to upload the aligned images </li>
        </ol>
          Hints:
          <ul>
          <li> Click and drag the annotation image to move it </li>
          <li> Change the angle to rotate the annotation image</li>
          <li> Use the scroll wheel on your mouse to zoom in and out</li>
          <li> Select an annotation image that has recognisable spatial distribution</li>
          <li> Click and drag the orange corners for fine tuning of the alignment</li>
        </ul>

        </div>
        <el-button @click="toggleHints" id="hintsButton">
          {{ showHints.text }}
        </el-button>
      </div>

      <div class="image-alignment-settings">
        <div>
          <label class="optical-image-select el-button">
            <input type="file"
                  style="display: none;"
                  @change="onFileChange"
                  accept=".jpg, .jpeg"/>
              Select optical image
          </label>

          <div style="padding: 3px; font-size: small;">
          {{ opticalImageFilename }}
          </div>

          <div class="el-upload__tip" slot="tip">
            JPEG file less than {{ limitMB }}MB in size
          </div>
        </div>

        <div class="sliders-box">
          Optical image padding, px:
          <el-slider :min=0 :max=500 :step=10 v-model="padding">
          </el-slider>
          IMS image opacity:
          <el-slider :min=0 :max=1 :step=0.01 v-model="annotImageOpacity">
          </el-slider>
        </div>

        <div class="annotation-selection">
          <span style="font-size: 14px; margin-bottom: 5px;" >Annotation:</span>
          <el-pagination
              layout="prev,slot,next"
              :total="this.annotations ? this.annotations.length : 0"
              :page-size=1
              @current-change="updateIndex">
            <el-select v-model="annotationIndex" filterable class="annotation-short-info">
              <el-option v-for="(annot, i) in annotations"
                         :key="annot.id"
                         :value="i" :label="renderLabel(annot)">
                <span v-html="renderAnnotation(annot)"></span>
              </el-option>
            </el-select>
          </el-pagination>

          <el-form :inline="true">
            <el-form-item label="Angle, °:" style="margin-bottom:5px;">
              <el-input-number :min=-180 :max=180 :step=1 v-model="angle" size="small">
              </el-input-number>
            </el-form-item>
          </el-form>
        </div>

        <div class="optical-image-submit">
          <el-row :gutter="20" style="margin-bottom: 10px">
            <el-col :span="12" :offset="12">
              <el-button @click="cancel">
                Cancel
              </el-button>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-button @click="reset"
                         v-show="opticalImgUrl"
                         style="margin-bottom: 10px;">
                Reset
              </el-button>
            </el-col>

            <el-col :span="12" :offset="opticalImgUrl ? 0 : 12">
              <el-button type="primary"
                         @click="submit"
                         :disabled="!opticalImgUrl">
                Submit
              </el-button>
            </el-col>
          </el-row>
        </div>
      </div>
    </div>

    <image-aligner
        v-if="opticalImgUrl"
        ref="aligner"
        style="position:relative;top:200px;z-index:1;"
        :annotImageOpacity="annotImageOpacity"
        :opticalSrc="opticalImgUrl"
        :initialTransform="initialTransform"
        :padding="padding"
        :rotationAngleDegrees="angle"
        :massSpecSrc="massSpecSrc">
    </image-aligner>
  </div>
</template>

<script>
 import ImageAligner from './ImageAligner.vue';
 import {annotationListQuery} from '../api/annotation';
 import {addOpticalImageQuery} from '../api/dataset';
 import {renderMolFormula, prettifySign, getJWT} from '../util';
 import gql from 'graphql-tag';

 export default {
   name: 'image-alignment-page',
   components: {
     ImageAligner
   },

   props: {
     limitMB: {
       type: Number,
       default: 25
     },

     // service for storing raw optical images
     imageStorageUrl: {
       type: String,
       default: '/raw_optical_images'
     }
   },

   data() {
     return {
       annotImageOpacity: 1,
       annotationIndex: 0,
       file: null,
       opticalImgUrl: null,
       alreadyUploaded: false,
       initialTransform: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
       padding: 100,
       angle: 0,
       showHints: {
         status: true,
         text: 'Hide hints'
       }
     }
   },

   mounted() {
     this.$apollo.query({
       query: gql`query Q($ds_id: String!) {
         rawOpticalImage(datasetId: $ds_id) {
           url
           transform
         }
       }`,
       variables: {ds_id: this.datasetId},
       fetchPolicy: 'network-only'
     }).then(({data}) => {
       const {url, transform} = data.rawOpticalImage;
       if (transform != null) {
         this.opticalImgUrl = url;
         this.initialTransform = transform;
         this.angle = 0;
         this.alreadyUploaded = true;
       }
     });
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
     },

     datasetName: {
       query: gql`query getDatasetName($id: String!) { dataset(id: $id) { name } }`,
       variables() {
         return {id: this.datasetId};
       },
       update: data => data.dataset.name
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
       return url ? url : null;
     },

     currentSumFormula() {
       if (!this.annotations)
         return 'loading...';
       if (this.annotations.length == 0)
         return 'no results';
       return this.renderAnnotation(this.currentAnnotation);
     },

     opticalImageFilename() {
       return this.file ? this.file.name : '';
     }
   },

   methods: {
     renderAnnotation(annotation) {
       const {sumFormula, adduct, dataset} = annotation;
       return renderMolFormula(sumFormula, adduct, dataset.polarity);
     },

     renderLabel(annotation) {
       const {sumFormula, adduct, dataset} = annotation;
       let result = `[${sumFormula + adduct}]`;
       result = prettifySign(result);
       result += {'POSITIVE': '⁺', 'NEGATIVE': '¯'}[dataset.polarity];
       return result;
     },

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
       this.angle = 0;
       this.initialTransform = [[1,0,0],[0,1,0],[0,0,1]];
       this.alreadyUploaded = false;
     },
     updateIndex(newIdx) {
       this.annotationIndex = newIdx - 1;
     },
     submit() {
       if (this.alreadyUploaded) {
         this.addOpticalImage(this.opticalImgUrl).then(() => {
           this.$message({
             type: 'success',
             message: 'The alignment has been updated'
           });
           this.$router.go(-1);
         }).catch((e) => {
           console.log(e);
           this.$message({
             type: 'error',
             message: 'Internal server error'
           });
         });
         return;
       }

       const uri = this.imageStorageUrl + "/upload/";
       let xhr = new XMLHttpRequest(),
           fd = new FormData();
       xhr.open("POST", uri, true);
       xhr.responseType = 'json';
       xhr.onreadystatechange = () => {
         if (xhr.readyState == 4 && xhr.status == 201) {
           const imageId = xhr.response.image_id,
               imageUrl = this.imageStorageUrl + '/' + imageId;
           this.addOpticalImage(imageUrl).then(() => {
             this.$message({
               type: 'success',
               message: 'The image and alignment were successfully saved!'
             });
             this.$router.go(-1);
           }).catch((e) => {
             console.log(e);
             this.$message({
               type: 'error',
               message: 'Internal server error'
             });
           });
         } else if (xhr.readyState == 4) {
           this.$message({
             type: 'error',
             message: "Couldn't upload the optical image due to server error"
           });
         }
       };
       fd.append('raw_optical_image', this.file);
       xhr.send(fd);
     },

     addOpticalImage(imageUrl) {
       return getJWT()
           .then(jwt =>
               this.$apollo.mutate({
                 mutation: addOpticalImageQuery,
                 variables: {
                   jwt,
                   datasetId: this.datasetId,
                   imageUrl,
                   transform: this.$refs.aligner.normalizedTransform
                 }
               }))
           .then(resp => resp.data.addOpticalImage)
           .then(status => {
             if (status != 'success')
               throw new Error(status);
             return status;
           });
     },

     reset() {
       this.$refs.aligner.reset();
       this.angle = 0;
     },

     cancel() {
       this.$router.go(-1);
     },

     toggleHints() {
       this.showHints.status = !this.showHints.status;

       if (this.showHints.status) {
         this.showHints.text = "Hide hints";
       } else {
         this.showHints.text = "Show hints";
       }
     }
   },
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
   min-width: 180px;
   text-align: center;
 }

 .el-pagination .annotation-short-info .el-input {
   width: 180px;
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
