import { computed, defineComponent } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useRoute, useRouter } from 'vue-router'
import { uniqBy } from 'lodash-es'
import { opticalImagesQuery } from '../../../api/dataset'
import ImageLoader from '../../../components/ImageLoader.vue'
import MolecularFormula from '../../../components/MolecularFormula'
import { ElIcon, ElPopover } from '../../../lib/element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useStore } from 'vuex'
import { encodeParams } from '../../Filters'
import './SegmentMarkers.scss'

// Cap markers to the same number as the co-localization widget.
const MAX_MARKERS = 12
const MIN_ENRICH_SCORE = 0.1

export const SegmentMarkers = defineComponent({
  name: 'SegmentMarkers',
  components: {
    ImageLoader,
    MolecularFormula,
    ElIcon,
    ElPopover,
    Loading,
  },
  props: {
    segmentationId: {
      type: String,
      required: false,
      default: null,
    },
    annotations: {
      type: Array,
      required: false,
      default: () => [],
    },
    segmentations: {
      type: Array,
      required: false,
      default: () => [],
    },
  },
  setup(props) {
    const route = useRoute()
    const router = useRouter()
    const store = useStore()
    const datasetId = computed(() => route.params.dataset_id as string)

    // Filter, de-duplicate and rank annotations for this cluster.
    const filteredAnnotations = computed(() => {
      if (!props.annotations || !props.segmentationId) return []

      const candidates = (props.annotations as any[])
        .filter(
          (annotation: any) =>
            annotation.segmentationId === props.segmentationId &&
            annotation.isotopeImages?.length > 0 &&
            annotation.enrichmentScore >= MIN_ENRICH_SCORE
        )
        // Rank by AUC (enrichmentScore) descending — the score we rank markers by.
        .sort((a: any, b: any) => b.enrichmentScore - a.enrichmentScore)

      // Remove duplicates (same ion annotated in multiple databases). Sorted by AUC
      // first, so uniqBy keeps the highest-scoring instance of each ion.
      return uniqBy(candidates, (a: any) => a.ion || `${a.sumFormula}-${a.adduct}-${a.mz}`).slice(0, MAX_MARKERS)
    })

    const { result: opticalImagesResult } = useQuery(opticalImagesQuery, {
      datasetId: datasetId.value,
    })

    const opticalImage = computed(() => {
      return (opticalImagesResult.value as any)?.dataset?.opticalImages?.[0]
    })

    const colormap = computed(() => store.getters.settings.annotationView.colormap)

    const buildAnnotationLink = (annotation: any) => {
      const path = `/dataset/${datasetId.value}/annotations`
      const filter = {
        datasetIds: [datasetId.value],
        compoundName: annotation.sumFormula,
        adduct: annotation.adduct,
        fdrLevel: Math.max(annotation.fdrLevel || 0.5, store.getters.filter.fdrLevel || 0.5),
      }
      const query = encodeParams(filter, path, store.state.filterLists)
      return router.resolve({ path, query }).href
    }

    // Check if we're still loading (when annotations array is empty but segmentations exist)
    const isLoading = computed(() => {
      return props.segmentations.length > 0 && props.annotations.length === 0
    })

    const renderMarker = (annotation: any) => {
      const optical = opticalImage.value
      const image = annotation.isotopeImages[0]
      // With an optical image present, fade zero-intensity pixels so the tissue
      // shows through for context; otherwise use an opaque colormap so empty
      // pixels are a solid colour instead of transparent/white.
      const imageLoaderSettings = {
        annotImageOpacity: 1.0,
        opticalOpacity: 1.0,
        opacityMode: optical ? 'linear' : 'constant',
        imagePosition: { zoom: 1, xOffset: 0, yOffset: 0 },
        pixelAspectRatio: 1,
        opticalSrc: optical?.url,
        opticalTransform: optical?.transform,
      }

      return (
        <div key={annotation.id} class="segment-marker">
          <a href={buildAnnotationLink(annotation)} target="_blank" rel="noopener" class="segment-marker-link">
            <div class="segment-marker-formula">
              <MolecularFormula ion={annotation.ion} />
            </div>
            <div class="segment-marker-mz">{annotation.mz?.toFixed(4)}</div>
            <ImageLoader
              src={image.url}
              {...imageLoaderSettings}
              colormap={colormap.value}
              minIntensity={image.minIntensity}
              maxIntensity={image.maxIntensity}
              width={300}
              height={300}
              showPixelIntensity
            />
            <ElPopover
              trigger="hover"
              placement="top"
              openDelay={100}
              v-slots={{
                reference: () => (
                  <div class="segment-marker-auc text-sm">AUC: {annotation.enrichmentScore?.toFixed(3)}</div>
                ),
                default: () => (
                  <div class="text-sm">
                    <div>AUC: {annotation.enrichmentScore?.toFixed(3)}</div>
                    <div>m/z: {annotation.mz?.toFixed(4)}</div>
                    {annotation.fdrLevel != null && <div>FDR: {Math.round(annotation.fdrLevel * 100)}%</div>}
                  </div>
                ),
              }}
            />
          </a>
        </div>
      )
    }

    return () => {
      if (isLoading.value) {
        return (
          <div class="segment-markers-container">
            <div class="loading-content">
              <ElIcon class="loading-icon">
                <Loading />
              </ElIcon>
              <p>Loading segment markers...</p>
            </div>
          </div>
        )
      }

      if (!props.segmentationId) {
        return (
          <div class="segment-markers-container">
            <p class="empty-message">No segmentation ID available for markers analysis.</p>
          </div>
        )
      }

      if (filteredAnnotations.value.length === 0) {
        return (
          <div class="segment-markers-container">
            <p class="empty-message">No markers found for this segment.</p>
          </div>
        )
      }

      return <div class="segment-markers-container">{filteredAnnotations.value.map(renderMarker)}</div>
    }
  },
})
