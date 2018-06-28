<template>
  <div id="alignment-page">
    <div class="image-alignment-top">
      <div class="image-alignment-header" style="text-align: left">
        <h3 style="margin: 5px; align-content: left">Optical image alignment for: <i>{{ datasetName }}</i></h3>
        <p> <b>upload</b> an optical image, <b>align</b> an annotation image, then <b>submit</b></p>
        <el-button @click="toggleHints" id="hintsButton">
          {{ showHints.text }}
        </el-button>
        <div id="hints" v-if="showHints.status === true">
          <ul class="hint-list">
            <li> <img class="mouse-hint-icon"
                      src="../assets/translate-icon.png"
                      title="Show/hide optical image"
            /> Click and drag the annotation image to move it </li>
            <li> <img class="mouse-hint-icon"
                      src="../assets/zoom-icon.png"
                      title="Show/hide optical image"
            /> Use the mouse scroll wheel to zoom in and out</li>
            <li> <img class="mouse-hint-icon"
                      src="../assets/rotate-icon.png"
                      title="Show/hide optical image"
            /> Right-click and drag to rotate the annotation image</li>
            <li> <img class="mouse-hint-icon"
                      src="../assets/images-icon.png"
                      title="Show/hide optical image"
            /> Choose an annotation image with a recognisable spatial distribution</li>
            <li> <img class="mouse-hint-icon"
                      src="../assets/corners-icon.jpg"
                      title="Show/hide optical image"
            /> Double click the annotation image to enable fine tuning</li>
          </ul>
        </div>
      </div>
      <div class="image-alignment-settings">
        <div>
          <label class="optical-image-select el-button">
            <input type="file"
                   class="input-optical-image"
                   style="display: none;"
                   @change="onFileChange($event)"
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

          Angle, °:
          <el-slider :min=-180 :max=180 :step=0.1 v-model="angle">
          </el-slider>
        </div>

        <div class="optical-image-submit">
          <el-row :gutter="20" style="margin-bottom: 10px">
            <el-col :span="12" :offset="opticalImgUrl ? 0 : 12">
              <el-button @click="cancel">
                Cancel
              </el-button>
            </el-col>
            <el-col :span="12" :offset="opticalImgUrl ? 0 : 12">
              <el-button @click="reset"
                         v-show="opticalImgUrl"
                         style="margin-bottom: 10px;">
                Reset
              </el-button>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12" :offset="opticalImgUrl ? 0 : 12">
              <el-button class="del-optical-image" @click="deleteOpticalImages"
                         v-show="opticalImgUrl">
                Delete
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
            style="position:relative;top:0px;z-index:1;"
            :annotImageOpacity="annotImageOpacity"
            :opticalSrc="opticalImgUrl"
            :initialTransform="initialTransform"
            :padding="padding"
            :rotationAngleDegrees="angle"
            :massSpecSrc="massSpecSrc"
            @updateRotationAngle="updateAngle">
    </image-aligner>

  </div>

</template>

<script>

 import ImageAligner from './ImageAligner.vue';
 import {annotationListQuery} from '../api/annotation';
 import {addOpticalImageQuery, deleteOpticalImageQuery, rawOpticalImageQuery} from '../api/dataset';
 import {renderMolFormula, prettifySign} from '../util';

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
     rawImageStorageUrl: {
       type: String,
       default: '/fs/raw_optical_images',
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
       },
       datasetName: ''
     }
   },

   apollo: {
     rawOpticalImage: {
       query: rawOpticalImageQuery,
       variables() {
         return {ds_id: this.datasetId}
       },
       fetchPolicy: 'network-only',
       update(data) {
         const {url, transform} = data.rawOpticalImage;
         if (transform != null) {
           this.opticalImgUrl = url;
           this.initialTransform = transform;
           this.angle = 0;
           this.alreadyUploaded = true;
         }
       }
     },

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

     datasetProperties: {
       query: gql`query getDatasetName($id: String!) {
                    dataset(id: $id) {
                      name
                      metadataType
                    }
                  }`,
       variables() {
         return {id: this.datasetId};
       },
       update(data) {
         this.datasetName = data.dataset.name;

         // in case user just opened a link to optical image upload page w/o navigation in web-app,
         // filters are not set up
         this.$store.commit('updateFilter', {metadataType: data.dataset.metadataType});
       }
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
     updateAngle(v){
       if (v<-180){
         v = 360+v
       }
       else if (v>180) {
         v = v-360
       }
       this.angle=v
     },

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
       document.querySelector('.input-optical-image').value='';
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
           this.$message({
             type: 'error',
             message: 'Internal server error'
           });
           throw e;
         });
         return;
       }

       const uri = this.rawImageStorageUrl + "/upload/";
       let xhr = new XMLHttpRequest(),
           fd = new FormData();
       xhr.open("POST", uri, true);
       xhr.responseType = 'json';
       xhr.onreadystatechange = () => {
         if (xhr.readyState == 4 && xhr.status == 201) {
           const imageId = xhr.response.image_id,
               imageUrl = this.rawImageStorageUrl + '/' + imageId;
           this.addOpticalImage(imageUrl).then(() => {
             this.$message({
               type: 'success',
               message: 'The image and alignment were successfully saved'
             });
             this.$router.go(-1);
           }).catch((e) => {
             this.$message({
               type: 'error',
               message: 'Internal server error'
             });
             throw e;
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

     async addOpticalImage(imageUrl) {
       // TODO if there are no iso images found prevent optical image addition
       const graphQLPromise = this.$apollo.mutate({
         mutation: addOpticalImageQuery,
         variables: {
           datasetId: this.datasetId,
           imageUrl,
           transform: this.$refs.aligner.normalizedTransform
         }
       });
       this.$message({
         message: 'Your optical image was submitted! Please wait until it will be saved...',
         type: 'success'
       });
       return graphQLPromise;
     },

     async deleteOpticalImages() {
       try {
         if (this.alreadyUploaded) {
           const graphQLResp = await this.$apollo.mutate({
             mutation: deleteOpticalImageQuery,
               variables: {
                 id: this.datasetId
               }
             });
           const resp = JSON.parse(graphQLResp.data.deleteOpticalImage);
           if (resp.status !== 'success') {
             this.$message({
               type: 'error',
               message: "Couldn't delete optical image due to an error"
             });
           } else {
             this.destroyOptImage();
             this.$message({
               type: 'success',
               message: 'The image and alignment were successfully deleted!'
             });
           }
         } else {
           this.destroyOptImage();
         }
       } catch(e) {
         this.$message({
           type: 'error',
           message: "Couldn't delete optical image due to an error"
         });
         throw e;
       }
     },

     destroyOptImage() {
       this.opticalImgUrl = window.URL.revokeObjectURL(this.opticalImgUrl);
       this.file = '';
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

  .mouse-hint-icon {
    width:  20px;
    height: 20px;
  }

  .hint-list{
    list-style-type: none;
  }

</style>
