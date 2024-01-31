import { computed, defineComponent, reactive } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { GetDatasetByIdQuery, getDatasetByIdQuery, msAcqGeometryQuery } from '../../../api/dataset'
import { AnnotationCountTable } from './AnnotationCountTable'
import safeJsonParse from '../../../lib/safeJsonParse'
import { DatasetMetadataViewer } from './DatasetMetadataViewer'
import { DatasetConfigViewer } from './DatasetConfigViewer'
import moment from 'moment'
import { isEmpty } from 'lodash'
import VisibilityBadge from '../common/VisibilityBadge'
import { DatasetActionsDropdown } from './DatasetActionsDropdown'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../../api/user'
import { DatasetOverviewGallery } from './DatasetOverviewGallery'
import RichText from '../../../components/RichText'
import isValidTiptapJson from '../../../lib/isValidTiptapJson'
import NewFeatureBadge from '../../../components/NewFeatureBadge'
import './DatasetOverviewPage.scss'

interface Props {
  className: string
  annotationLabel: string
  detailLabel: string
  projectLabel: string
  inpFdrLvls: number[]
}

const DatasetOverviewPage = defineComponent<Props>({
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
    const datasetId = computed(() => $route.params.dataset_id)
    const {
      result: datasetResult,
      loading: datasetLoading,
    } = useQuery<GetDatasetByIdQuery>(getDatasetByIdQuery, { id: datasetId, inpFdrLvls: props.inpFdrLvls })
    const dataset = computed(() => datasetResult.value != null ? datasetResult.value.dataset : null)
    const {
      result: currentUserResult,
      loading: userLoading,
    } = useQuery<CurrentUserRoleResult|any>(currentUserRoleQuery)
    const currentUser = computed(() => currentUserResult.value != null ? currentUserResult.value.currentUser
      : null)

    const projectLink = (projectIdOrSlug: string) => {
      return ({
        name: 'project',
        params: { projectIdOrSlug },
      })
    }

    return () => {
      const {
        name, submitter, group, projects, annotationCounts, metadataJson, id,
        isPublic, description, canEdit, configJson, acquisitionGeometry, sizeHash,
      } = dataset?.value || {} as any
      const { annotationLabel, detailLabel, projectLabel, inpFdrLvls } = props
      const metadata = safeJsonParse(metadataJson) || {}
      const config = safeJsonParse(configJson) || {}
      const acqGeo = safeJsonParse(acquisitionGeometry) || {}
      const fileSize = safeJsonParse(sizeHash) || {}

      // hide deprecated fields
      // eslint-disable-next-line camelcase
      delete metadata?.Submitted_By
      // eslint-disable-next-line camelcase
      delete metadata?.Additional_Information

      const groupLink = $router.resolve({ name: 'group', params: { groupIdOrSlug: group?.id || '' } }).href
      const upDate = moment(moment(dataset?.value?.uploadDT)).isValid()
        ? moment(dataset?.value?.uploadDT).format('D MMMM, YYYY') : ''
      const publicationStatus = computed(() => {
        if (Array.isArray(projects)
          && projects.some(({ publicationStatus }) => publicationStatus === 'PUBLISHED')) {
          return 'Published'
        }
        if (Array.isArray(projects)
          && projects.some(({ publicationStatus }) => publicationStatus === 'UNDER_REVIEW')) {
          return 'Under review'
        }
        return null
      })
      const dsDescription = isValidTiptapJson(safeJsonParse(description))
        ? safeJsonParse(description) : null
      const canViewPublicationStatus = (dataset.value?.status === 'FINISHED' && canEdit
        && publicationStatus?.value != null)

      if ((datasetLoading.value && dataset.value === null) || userLoading.value) {
        return <div class="text-center">Loading...</div>
      } else if (dataset.value === null) {
        return <div class="text-center">This dataset doesn't exist, or you do not have access to it.</div>
      }

      return (
        <div class={'dataset-overview-container justify-center'}>
          <div class={'dataset-overview-wrapper max-w-4xl w-full'}>
            <div class='dataset-overview-header'>
              <h1 class='text-center truncate'>
                {name}
                <span class='text-base align-middle'>
                  {
                    !isPublic
                    && <VisibilityBadge datasetId={id ? id.toString() : ''}/>
                  }
                </span>
              </h1>
              <NewFeatureBadge
                featureKey="imzmlBrowser"
              >
                <DatasetActionsDropdown dataset={dataset?.value} currentUser={currentUser?.value}/>
              </NewFeatureBadge>
            </div>
            <div class='dataset-overview-holder'>
              <p class='truncate'>{submitter?.name}
                {group && <a class='ml-1' href={groupLink}>({group?.shortName})</a>}
              </p>
              <div>{upDate}</div>
              {
                description
                && <RichText
                  class="dataset-opt-description p-0"
                  placeholder=" "
                  content={dsDescription}
                  readonly={true}
                />
              }
            </div>
            <div class='dataset-overview-holder'>
              <h1 class='truncate'>{annotationLabel}</h1>
              <AnnotationCountTable id={id} data={annotationCounts} header={inpFdrLvls}/>
            </div>
            {
              !isEmpty(metadata)
              && <div class='dataset-overview-holder'>
                <h1 class='truncate'>{detailLabel}</h1>
                <DatasetMetadataViewer metadata={metadata}/>
              </div>
            }
            {
              (!isEmpty(config) || !isEmpty(acqGeo))
              && <div class='dataset-overview-holder'>
                <DatasetConfigViewer data={config} acqGeo={acqGeo} fileSize={fileSize}/>
              </div>
            }
            {
              Array.isArray(projects) && projects.length > 0
              && <div class='dataset-overview-holder'>
                <h1 class='truncate'>{projectLabel}</h1>
                {
                  projects.map((project) => {
                    return (
                      <div key={project.id} class="flex-grow box-border min-w-64 p-0 break-words">
                        <ul class="list-none p-0 py-3 m-0 max-h-40 overflow-y-auto">
                          <li>
                            <b>Name: </b>
                            <router-link class="ml-1" to={projectLink(project.id)}>
                              {project.name}
                            </router-link>
                          </li>
                          {
                            canViewPublicationStatus
                            && <li>
                              <b>Status: </b>
                              {publicationStatus?.value}
                            </li>
                          }
                        </ul>
                      </div>
                    )
                  })
                }
              </div>
            }
          </div>
        </div>
      )
    }
  },
})

export default DatasetOverviewPage
