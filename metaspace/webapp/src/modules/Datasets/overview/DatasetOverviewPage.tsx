import { computed, defineComponent, reactive, ref } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { GetDatasetByIdQuery, getDatasetByIdQuery } from '../../../api/dataset'
import safeJsonParse from '../../../lib/safeJsonParse'
import moment from 'moment'
import { isEmpty } from 'lodash'

interface Props {
  className: string
  annotationLabel: string
  detailLabel: string
  projectLabel: string
  inpFdrLvls: number[]
}

export default defineComponent<Props>({
  name: 'DatasetOverviewPage',
  props: {
    className: {
      type: String,
      default: 'dataset-overview',
    },
    annotationLabel: {
      type: String,
      default: 'Annotations',
    },
    detailLabel: {
      type: String,
      default: 'Details',
    },
    projectLabel: {
      type: String,
      default: 'Projects',
    },
    inpFdrLvls: {
      type: Array,
      default: () => [5, 10, 20, 50],
    },
  },
  // Last reprocessed date (as currently)/Upload date/Number of annotations for FDR 10%/User name/Dataset name
  setup(props, ctx) {
    const { $router, $route } = ctx.root
    const datasetId = computed(() => $route.params.datasetId)
    const {
      result: datasetResult,
      loading: datasetLoading,
    } = useQuery<GetDatasetByIdQuery>(getDatasetByIdQuery, { id: datasetId, inpFdrLvls: props.inpFdrLvls })
    const dataset = computed(() => datasetResult.value != null ? datasetResult.value.dataset : null)

    return () => {
      const { name, submitter, group, projects, metadataJson } = dataset?.value || {}
      const { annotationLabel, detailLabel, projectLabel } = props
      const metadata = safeJsonParse(metadataJson) || {}
      const groupLink = $router.resolve({ name: 'group', params: { groupIdOrSlug: group?.id || '' } }).href
      const upDate = moment(moment(dataset?.value?.uploadDT)).isValid()
        ? moment(dataset?.value?.uploadDT).format('D MMMM, YYYY') : ''

      if (datasetLoading.value && dataset.value == null) {
        return <div class="text-center">Loading...</div>
      } else if (dataset.value == null) {
        return <div class="text-center">This dataset doesn't exist, or you do not have access to it.</div>
      }

      return (
        <div class='dataset-overview-container'>
          <div class='dataset-overview-wrapper w-full lg:w-1/2'>
            <div class='dataset-overview-header'>
              <div class='text-4xl truncate'>{name}</div>
              <div>Actions</div>
            </div>
            <div class='dataset-overview-holder'>
              <div class='truncate'>{submitter?.name}
                {group && <a class='ml-1' href={groupLink}>({group?.shortName})</a>}
                {!group && <a class='ml-1' href={groupLink}>(test)</a>}
              </div>
              <div>{upDate}</div>
              <div class='dataset-opt-description'>Lorem ipsim</div>
            </div>
            <div class='dataset-overview-holder'>
              <div class='text-4xl truncate'>{annotationLabel}</div>
            </div>
            {
              !isEmpty(metadata)
              && <div class='dataset-overview-holder'>
                <div class='text-4xl truncate'>{detailLabel}</div>
              </div>
            }
            {
              Array.isArray(projects) && projects.length > 0
              && <div class='dataset-overview-holder'>
                <div class='text-4xl truncate'>{projectLabel}</div>
              </div>
            }
          </div>
          <div class='dataset-overview-wrapper dataset-overview-img-wrapper w-full lg:w-1/2'/>
        </div>
      )
    }
  },
})
