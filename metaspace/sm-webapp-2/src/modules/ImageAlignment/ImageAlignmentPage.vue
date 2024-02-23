<template>
  <div id="alignment-page">
    <div class="image-alignment-top">
      <div class="image-alignment-header" style="text-align: left">
        <h3 style="margin: 5px; align-content: start">
          Optical image alignment for: <i>{{ datasetName }}</i>
        </h3>
        <p><b>upload</b> an optical image, <b>align</b> an annotation image, then <b>submit</b></p>
        <el-button id="hintsButton" @click="toggleHints">
          {{ showHints.text }}
        </el-button>
        <div v-if="showHints.status === true" id="hints">
          <ul class="hint-list">
            <li>
              <img class="mouse-hint-icon" src="../../assets/translate-icon.png" title="Show/hide optical image" />
              Click and drag the annotation image to move it
            </li>
            <li>
              <img class="mouse-hint-icon" src="../../assets/zoom-icon.png" title="Show/hide optical image" /> Use the
              mouse scroll wheel to zoom in and out
            </li>
            <li>
              <img class="mouse-hint-icon" src="../../assets/rotate-icon.png" title="Show/hide optical image" />
              Right-click and drag to rotate the annotation image
            </li>
            <li>
              <img class="mouse-hint-icon" src="../../assets/images-icon.png" title="Show/hide optical image" /> Choose
              an annotation image with a recognisable spatial distribution
            </li>
            <li>
              <img class="mouse-hint-icon" src="../../assets/corners-icon.jpg" title="Show/hide optical image" /> Double
              click the annotation image to enable fine tuning
            </li>
          </ul>
        </div>
      </div>
      <div class="image-alignment-settings">
        <div>
          <label class="optical-image-select el-button">
            <input
              type="file"
              class="input-optical-image"
              style="display: none"
              accept=".jpg,.jpeg,.png"
              @change="onFileChange($event)"
            />
            Select optical image
          </label>

          <div style="padding: 3px; font-size: small">
            {{ opticalImageFilename }}
          </div>

          <div id="tip" class="el-upload__tip">JPEG or PNG file less than {{ limitMB }}MB in size</div>
        </div>

        <div class="sliders-box">
          Optical image padding, px:
          <el-slider v-model="padding" :min="0" :max="500" :step="10" />

          IMS image opacity:
          <el-slider v-model="annotImageOpacity" :min="0" :max="1" :step="0.01" />
          <el-checkbox
            v-if="showTicOption"
            v-model="enableNormalization"
            :disabled="currentAnnotation && currentAnnotation.type === 'TIC Image'"
          >
            TIC normalization
          </el-checkbox>
        </div>

        <div class="annotation-selection">
          <span style="font-size: 14px; margin-bottom: 5px">Annotation:</span>
          <el-pagination
            layout="prev,slot,next"
            :total="annotations ? annotations.length : 0"
            :page-size="1"
            :current-page="annotationIndex + 1"
            @current-change="updateIndex"
          >
            <el-select
              v-model="annotationIndex"
              filterable
              :loading="!annotations"
              class="annotation-short-info"
              @change="(newIdx) => updateIndex(newIdx + 1)"
            >
              <el-option v-for="(annot, i) in annotations" :key="annot.id" :value="i" :label="renderLabel(annot)">
                <span v-html="renderAnnotation(annot)" />
              </el-option>
            </el-select>
          </el-pagination>

          Angle, °:
          <el-slider v-model="angle" :min="-180" :max="180" :step="0.1" />
        </div>

        <div class="optical-image-submit">
          <el-row :gutter="20" style="margin-bottom: 10px">
            <el-col :span="12" :offset="opticalImgUrl ? 0 : 12">
              <el-button @click="cancel"> Cancel </el-button>
            </el-col>
            <el-col :span="12" :offset="opticalImgUrl ? 0 : 12">
              <el-button v-show="opticalImgUrl" style="margin-bottom: 10px" @click="reset"> Reset </el-button>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12" :offset="opticalImgUrl ? 0 : 12">
              <el-button v-show="opticalImgUrl" class="del-optical-image" @click="deleteOpticalImages">
                Delete
              </el-button>
            </el-col>
            <el-col :span="12" :offset="opticalImgUrl ? 0 : 12">
              <el-button type="primary" :disabled="!opticalImgUrl" @click="submit"> Submit </el-button>
            </el-col>
          </el-row>
        </div>
      </div>
    </div>
    <image-aligner
      v-if="opticalImgUrl && !hasNormalizationError"
      ref="aligner"
      style="position: relative; top: 0px; z-index: 1"
      :annot-image-opacity="annotImageOpacity"
      :optical-src="opticalImgUrl"
      :tic-data="normalizationData"
      :initial-transform="initialTransform"
      :padding="padding"
      :rotation-angle-degrees="angle"
      :ion-image-src="massSpecSrc"
      @updateRotationAngle="updateAngle"
    />
    <div v-if="hasNormalizationError" class="normalization-error-wrapper">
      <i class="el-icon-error info-icon mr-2" />
      <p class="text-lg">There was an error on normalization!</p>
    </div>
  </div>
</template>

<script>
import ImageAligner from './ImageAligner.vue'
import { renderMolFormula, renderMolFormulaHtml } from '../../lib/util'

import gql from 'graphql-tag'
import reportError from '../../lib/reportError'
import graphqlClient from '../../api/graphqlClient'
import { readNpy } from '../../lib/npyHandler'
import safeJsonParse from '../../lib/safeJsonParse'
import config from '../../lib/config'
import AwsS3Multipart from '@uppy/aws-s3-multipart'
import Uppy from '@uppy/core'
import createStore from '../../components/UppyUploader/store'
import { defineComponent, ref, reactive, computed, watch, onMounted, onBeforeUnmount, toRefs, inject } from 'vue'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from '../../lib/element-plus'
import { annotationListQuery } from '../../api/annotation'
import {
  addOpticalImageQuery,
  deleteOpticalImageQuery,
  getDatasetDiagnosticsQuery,
  rawOpticalImageQuery,
} from '../../api/dataset'
import { currentUserRoleQuery } from '../../api/user'

export default defineComponent({
  name: 'ImageAlignmentPage',
  components: {
    ImageAligner,
  },
  props: {
    limitMB: {
      type: Number,
      default: 50,
    },
    // service for storing raw optical images
    rawImageStorageUrl: {
      type: String,
      default: '/fs/raw_optical_images',
    },
  },
  setup(props) {
    const store = useStore()
    const router = useRouter()
    const aligner = ref(null)
    const apolloClient = inject(DefaultApolloClient)
    const state = reactive({
      uppy: null,
      status: null,
      uppyImageUrl: null,
      storageKey: {
        uuid: null,
        uuidSignature: null,
      },
      annotImageOpacity: 1,
      annotationIndex: 0,
      file: null,
      fileId: null,
      opticalImgUrl: null,
      originUuid: null,
      ticData: null,
      alreadyUploaded: false,
      initialTransform: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      padding: 100,
      angle: 0,
      enableNormalization: false,
      showFullTIC: false,
      showHints: {
        status: true,
        text: 'Hide hints',
      },
      datasetName: '',
    })

    const datasetId = computed(() => store.state.route.params.dataset_id)
    const { onResult: onOpticalImageResult } = useQuery(rawOpticalImageQuery, () => ({ ds_id: datasetId.value }))

    onOpticalImageResult(async (result) => {
      const data = result?.data
      if (data?.rawOpticalImage != null && data.rawOpticalImage.transform != null) {
        const { url, transform, uuid } = data.rawOpticalImage
        state.originUuid = uuid
        state.opticalImgUrl = url
        state.initialTransform = transform
        state.angle = 0
        state.alreadyUploaded = true
      }
    })

    const { result: annotationsResult } = useQuery(annotationListQuery, () => ({
      filter: { fdrLevel: 0.5 },
      dFilter: { ids: datasetId.value },
      offset: 0,
      limit: 1000,
      query: '',
      orderBy: 'ORDER_BY_MSM',
      sortingOrder: 'DESCENDING',
      countIsomerCompounds: false,
    }))

    const annotations = computed(() => {
      // get normalization data for selected annotation
      const annotation = annotationsResult.value?.allAnnotations[0]
      // add TIC reference
      if (config.features.tic && annotation && annotation.id !== 'TIC Image') {
        const ticAnnotation = [
          {
            ...annotation,
            id: 'TIC Image',
            type: 'TIC Image',
          },
        ]
        return ticAnnotation.concat(annotation)
      }
      return annotationsResult.value?.allAnnotations
    })

    const { result: datasetPropertiesResult, onResult: onDatasetResult } = useQuery(
      gql`
        query getDatasetName($id: String!) {
          dataset(id: $id) {
            id
            name
            metadataType
          }
        }
      `,
      () => ({ id: datasetId.value })
    )
    const datasetProperties = computed(() => datasetPropertiesResult.value?.dataset)
    const datasetName = computed(() => datasetProperties.value?.name)

    onDatasetResult(async (result) => {
      const data = result?.data
      if (!data) return
      // in case user just opened a link to optical image upload page w/o navigation in web-app,
      // filters are not set up
      store.commit('replaceFilter', { metadataType: data.dataset.metadataType })
    })

    const { result: currentUserResult } = useQuery(currentUserRoleQuery, null, { fetchPolicy: 'cache-first' })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const uuid = computed(() => state.storageKey.uuid)
    const uploadEndpoint = computed(() => `${window.location.origin}/dataset_upload`)
    const hasNormalizationError = computed(() => state.enableNormalization && state.ticData && state.ticData.error)
    const showTicOption = computed(() => config.features.tic)
    const normalizationData = computed(() => (state.showFullTIC || state.enableNormalization ? state.ticData : null))
    const currentAnnotation = computed(() => {
      if (!annotations.value || annotations.value.length === 0) {
        return null
      }
      return annotations.value[state.annotationIndex]
    })
    const massSpecSrc = computed(() => {
      const url = currentAnnotation.value ? currentAnnotation.value.isotopeImages[0].url : null
      return url || null
    })
    const currentSumFormula = computed(() => {
      if (!annotations.value) {
        return 'loading...'
      }
      if (annotations.value.length === 0) {
        return 'no results'
      }
      return renderAnnotation(currentAnnotation.value)
    })
    const opticalImageFilename = computed(() => (state.file ? state.file.name : ''))

    const updateAngle = (v) => {
      if (v < -180) {
        v = 360 + v
      } else if (v > 180) {
        v = v - 360
      }
      state.angle = v
    }

    const fetchStorageKey = async () => {
      state.status = 'LOADING'
      try {
        const response = await fetch(`${uploadEndpoint.value}/s3/uuid`)
        if (response.status < 200 || response.status >= 300) {
          const responseBody = await response.text()
          reportError(new Error(`Unexpected server response getting upload UUID: ${response.status} ${responseBody}`))
        } else {
          // uuid and uuidSignature
          state.storageKey = await response.json()
        }
      } catch (e) {
        reportError(e)
      } finally {
        state.status = 'READY'
      }
    }

    const renderAnnotation = (annotation) => {
      const { ion } = annotation
      return annotation.type === 'TIC Image' ? 'TIC Image' : renderMolFormulaHtml(ion)
    }

    const renderLabel = (annotation) => {
      const { ion } = annotation
      return annotation.type === 'TIC Image' ? 'TIC Image' : renderMolFormula(ion)
    }

    const onFileChange = async (event) => {
      const file = event.target.files[0]

      if (!file) {
        return
      }

      if (file.size > props.limitMB * 1024 * 1024) {
        ElMessage({
          type: 'error',
          message: `The file exceeds ${props.limitMB} MB limit`,
        })
        return
      }

      await state.uppy.removeFile(state.fileId)

      await state.uppy.addFile({
        name: file.name,
        type: file.type,
        meta: { user: currentUser.value?.id, source: 'webapp', datasetId: datasetId.value, uuid: uuid.value },
        data: file,
      })

      window.URL.revokeObjectURL(state.opticalImgUrl)
      state.file = file
      state.opticalImgUrl = window.URL.createObjectURL(state.file)
      state.angle = 0
      state.initialTransform = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]
      state.alreadyUploaded = false
      document.querySelector('.input-optical-image').value = ''
    }

    const updateIndex = (newIdx) => {
      state.annotationIndex = newIdx - 1
      updateNormalizationData(currentAnnotation.value)
    }

    const updateNormalizationData = async (currentAnnotation) => {
      if (!currentAnnotation) {
        return null
      }

      try {
        const resp = await apolloClient.query({
          query: getDatasetDiagnosticsQuery,
          variables: {
            id: currentAnnotation.dataset.id,
          },
          fetchPolicy: 'cache-first',
        })
        state.showFullTIC = currentAnnotation.type === 'TIC Image'
        const dataset = resp.data.dataset
        const tics = dataset.diagnostics.filter((diagnostic) => diagnostic.type === 'TIC')
        const tic = tics[0].images.filter((image) => image.key === 'TIC' && image.format === 'NPY')
        const { data, shape } = await readNpy(tic[0].url)
        const metadata = safeJsonParse(tics[0].data)
        metadata.maxTic = metadata.max_tic
        metadata.minTic = metadata.min_tic
        delete metadata.max_tic
        delete metadata.min_tic

        state.ticData = {
          data,
          shape,
          metadata: metadata,
          type: 'TIC',
          error: false,
          showFullTIC: currentAnnotation.type === 'TIC Image',
        }
      } catch (e) {
        state.ticData = {
          data: null,
          shape: null,
          metadata: null,
          showFullTIC: null,
          type: 'TIC',
          error: true,
        }
      }
    }

    const submit = async () => {
      try {
        await addOpticalImage(!state.fileId ? state.originUuid : uuid.value)
        ElMessage({
          type: 'success',
          message: 'The image and alignment were successfully saved',
        })
        router.go(-1)
      } catch (e) {
        reportError(e)
      }
    }

    const addOpticalImage = async (imageUrl) => {
      ElMessage({
        message: 'Your optical image has been submitted! Please wait while it is saved...',
        type: 'success',
      })
      // TODO if there are no iso images found prevent optical image addition
      await apolloClient.mutate({
        mutation: addOpticalImageQuery,
        variables: {
          datasetId: datasetId.value,
          imageUrl,
          transform: aligner.value.normalizedTransform,
        },
      })
      // Reset the GraphQL cache because thumbnails are cached.
      // Ideally this would just evict cached entries for this dataset, but apollo-cache's only other
      // cache eviction mechanism is so specific that it's hard to be sure that you've caught all affected queries.
      // It's better to waste bandwidth here than to lose time debugging cache issues in the future.
      await graphqlClient.cache.reset()
    }

    const deleteOpticalImages = async () => {
      try {
        const graphQLResp = await apolloClient.mutate({
          mutation: deleteOpticalImageQuery,
          variables: {
            id: datasetId.value,
          },
        })
        // Reset the GraphQL cache - see comment in addOpticalImage for rationale
        await graphqlClient.cache.reset()
        const resp = JSON.parse(graphQLResp.data.deleteOpticalImage)
        if (resp.status !== 'success') {
          ElMessage({
            type: 'error',
            message: "Couldn't delete optical image due to an error",
          })
        } else {
          destroyOptImage()
          ElMessage({
            type: 'success',
            message: 'The image and alignment were successfully deleted!',
          })
        }
      } catch (e) {
        reportError(e)
      }
    }

    const destroyOptImage = () => {
      state.opticalImgUrl = window.URL.revokeObjectURL(state.opticalImgUrl)
      state.file = ''
    }

    const reset = () => {
      aligner.value.reset()
      state.angle = 0
    }

    const cancel = () => {
      router.go(-1)
    }

    const toggleHints = () => {
      state.showHints.status = !state.showHints.status

      if (state.showHints.status) {
        state.showHints.text = 'Hide hints'
      } else {
        state.showHints.text = 'Show hints'
      }
    }

    onMounted(() => {
      fetchStorageKey()
      const uppy = new Uppy({
        debug: true,
        autoProceed: true,
        allowMultipleUploads: false,
        restrictions: {
          maxFileSize: props.limitMB * 1024 * 1024,
          maxNumberOfFiles: 1,
        },
        meta: {},
        store: createStore(),
      })
        .on('file-added', (file) => {
          if (state.fileId) {
            state.uppy.removeFile(state.fileId)
          }
          state.fileId = file.id
        })
        .on('file-removed', (file) => {
          console.log('file-removed', file)
        })
        .on('upload', () => {
          console.log('upload')
        })
        .on('upload-error', (...args) => {
          console.log(args)
        })
        .on('upload-success', (file, response) => {
          state.uppyImageUrl = response.uploadURL
        })
        .on('error', (...args) => {
          console.log(args)
        })
        .on('complete', (result) => {
          console.log('Upload complete! We’ve uploaded these files:', result.successful)
        })

      uppy.use(AwsS3Multipart, {
        limit: 2,
        companionUrl: `${window.location.origin}/raw_opt_upload`,
      })

      state.uppy = uppy
    })

    onBeforeUnmount(() => {
      state.uppy.close()
    })

    watch(annotations, (newAnnotations) => {
      const annotation = newAnnotations[0]
      updateNormalizationData(annotation)
    })

    return {
      ...toRefs(state),
      aligner,
      uuid,
      uploadEndpoint,
      datasetId,
      datasetName,
      hasNormalizationError,
      showTicOption,
      normalizationData,
      currentAnnotation,
      massSpecSrc,
      currentSumFormula,
      updateAngle,
      fetchStorageKey,
      renderAnnotation,
      renderLabel,
      onFileChange,
      updateIndex,
      updateNormalizationData,
      submit,
      addOpticalImage,
      deleteOpticalImages,
      destroyOptImage,
      reset,
      cancel,
      toggleHints,
      opticalImageFilename,
      annotations,
    }
  },
})
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
  min-height: calc(100vh - 104px);
  margin: 0;
  overflow: auto;
  padding: 20px;
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

.optical-image-submit,
.annotation-selection {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.mouse-hint-icon {
  width: 20px;
  height: 20px;
}

.hint-list {
  list-style-type: none;
}

.normalization-error-wrapper {
  height: 537px;
  width: 100%;
  @apply flex items-center justify-center;
}
.info-icon {
  font-size: 20px;
}
</style>
