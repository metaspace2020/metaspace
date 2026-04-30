import { computed, defineComponent } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useRoute } from 'vue-router'
import { opticalImagesQuery } from '../../../api/dataset'
import RelatedAnnotations from '../../Annotations/annotation-widgets/default/RelatedAnnotations.vue'
import { ElIcon } from '../../../lib/element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useStore } from 'vuex'
import './SegmentMarkers.scss'

export const SegmentMarkers = defineComponent({
  name: 'SegmentMarkers',
  components: {
    RelatedAnnotations,
    ElIcon,
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
    const store = useStore()
    const datasetId = computed(() => route.params.dataset_id as string)

    // Filter and process annotations from props
    const filteredAnnotations = computed(() => {
      if (!props.annotations || !props.segmentationId) return []

      return (props.annotations as any[])
        .filter(
          (annotation: any) =>
            annotation.segmentationId === props.segmentationId && annotation.isotopeImages?.length > 0
        )
        .sort((a: any, b: any) => b.enrichmentScore - a.enrichmentScore)
        .slice(0, 6) // Apply topN limit similar to original query
        .filter((annotation: any) => annotation.enrichmentScore >= 0.1) // Apply minEnrichScore filter
    })

    const { result: opticalImagesResult } = useQuery(opticalImagesQuery, {
      datasetId: datasetId.value,
    })

    const opticalImage = computed(() => {
      return (opticalImagesResult.value as any)?.dataset?.opticalImages?.[0]
    })

    // Check if we're still loading (when annotations array is empty but segmentations exist)
    const isLoading = computed(() => {
      return props.segmentations.length > 0 && props.annotations.length === 0
    })

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

      // Just loop through all annotations and display each one
      return (
        <div class="segment-markers-container">
          {filteredAnnotations.value.map((annotation: any) => {
            return (
              <RelatedAnnotations
                key={annotation.id}
                query="allAdducts"
                annotation={{ ...annotation, dataset: { id: datasetId.value } }}
                databaseId={store.getters.filter.databaseId}
                imageLoaderSettings={{
                  annotImageOpacity: 1.0,
                  opticalOpacity: 1.0,
                  opacityMode: 'linear',
                  imagePosition: { zoom: 1, xOffset: 0, yOffset: 0 },
                  pixelAspectRatio: 1,
                  opticalSrc: opticalImage.value?.url,
                  opticalTransform: opticalImage.value?.transform,
                }}
                width={300}
                height={300}
              />
            )
          })}
        </div>
      )
    }
  },
})
