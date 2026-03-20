import { computed, defineComponent } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useRoute } from 'vue-router'
import { getSegmentationIonProfilesWithImagesQuery, opticalImagesQuery } from '../../../api/dataset'
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
  },
  setup(props) {
    const route = useRoute()
    const store = useStore()
    const datasetId = computed(() => route.params.dataset_id as string)

    const queryVariables = computed(() => {
      if (!props.segmentationId) return null

      return {
        segmentationId: props.segmentationId,
        filter: {
          topN: 6,
          minEnrichScore: 0.1,
        },
      }
    })

    const { result, loading, error } = useQuery(getSegmentationIonProfilesWithImagesQuery, queryVariables, {
      skip: computed(() => !props.segmentationId),
    })

    // Transform segmentation ion profiles into annotation format
    const annotations = computed(() => {
      if (!result.value || !(result.value as any).segmentationIonProfiles) return []

      return (result.value as any).segmentationIonProfiles
        .filter((profile: any) => profile.annotation?.isotopeImages?.length > 0)
        .sort((a: any, b: any) => b.enrichScore - a.enrichScore)
        .map((profile: any) => ({
          ...profile.annotation,
          enrichmentScore: profile.enrichScore,
        }))
    })

    const { result: opticalImagesResult } = useQuery(opticalImagesQuery, {
      datasetId: datasetId.value,
    })

    const opticalImage = computed(() => {
      return (opticalImagesResult.value as any)?.dataset?.opticalImages?.[0]
    })

    return () => {
      if (loading.value) {
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

      if (error.value || !props.segmentationId) {
        const message = error.value
          ? `Error loading segment markers: ${error.value.message}`
          : 'No segmentation ID available for markers analysis.'

        return (
          <div class="segment-markers-container">
            <p class="empty-message">{message}</p>
          </div>
        )
      }

      if (annotations.value.length === 0) {
        return (
          <div class="segment-markers-container">
            <p class="empty-message">No enriched annotations found for this segment.</p>
          </div>
        )
      }

      // Just loop through all annotations and display each one
      return (
        <div class="segment-markers-container">
          {annotations.value.map((annotation: any) => {
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
                  opticalSrc: opticalImage.value.url,
                  opticalTransform: opticalImage.value.transform,
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
