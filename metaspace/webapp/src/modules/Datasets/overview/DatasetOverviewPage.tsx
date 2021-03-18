import { computed, defineComponent } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { DatasetAnnotationCount, GetDatasetByIdQuery, getDatasetByIdQuery } from '../../../api/dataset'
import safeJsonParse from '../../../lib/safeJsonParse'
import moment from 'moment'
import { isEmpty } from 'lodash'
import { encodeParams } from '../../Filters'

interface AnnotationTableData{
  name: string
  [key: string]: any // dynamic keys according to fdrs
}

interface AnnotationProps {
  id: string
  sumRowLabel: string
  btnLabel: string
  data: DatasetAnnotationCount[]
  header: string[]
  headerTitleSuffix: string
}

const AnnotationCounts = defineComponent<AnnotationProps>({
  name: 'AnnotationCounts',
  props: {
    id: { type: String, default: '' },
    sumRowLabel: { type: String, default: 'Total Annotations' },
    btnLabel: { type: String, default: 'Browse annotations' },
    data: { type: Array, default: () => [] },
    header: { type: Array, default: () => [5, 10, 20, 50] },
    headerTitleSuffix: { type: String, default: '%' },
  },
  setup(props, ctx) {
    const annotationsLink = (datasetId: string, database?: string, fdrLevel?: number) => ({
      path: '/annotations',
      query: encodeParams({
        datasetIds: [datasetId],
        database,
        fdrLevel,
      }),
    })

    const mountTableData = (data: DatasetAnnotationCount[], header: string[]) : AnnotationTableData[] => {
      if (!data) { return [] }

      return data.map((item: DatasetAnnotationCount) => {
        const obj = {} as AnnotationTableData
        obj.id = item?.databaseId
        obj.name = `${item?.dbName}${item?.dbVersion ? `-${item?.dbVersion}` : ''}`
        header.forEach((headerEl: string) => {
          obj[headerEl] = Array.isArray(item?.counts)
            ? (item.counts.find((count: any) => count.level === headerEl) || {}).n : '-'
        })
        return obj
      })
    }

    const browseAnnotations = () => {
      const { id } = props
      ctx.root.$router.push(annotationsLink(id))
    }

    const formatTitle = (col: number|string) => {
      const { headerTitleSuffix } = props
      return `${col === 'name' ? 'Database' : col}${col !== 'name' ? headerTitleSuffix : ''}`
    }

    const formatCell = (row: any, column: any, cellValue: any, rowIndex: number, colIndex: number) => {
      const { id } = props
      if (colIndex === 0) { return cellValue }

      return (
        <router-link to={annotationsLink(id?.toString(), row?.id,
          parseInt(column?.property, 10) / 100)}>
          {cellValue}
        </router-link>
      )
    }

    return () => {
      const { data, header, sumRowLabel, btnLabel } = props
      const tableData = mountTableData(data, header)

      return (
        <div class="relative">
          <el-table
            data={tableData}
            show-summary={true}
            sum-text={sumRowLabel}
            style="width: 100%; margin-top: 20px">
            {
              ['name'].concat(header).map((col, colIndex) => {
                return <el-table-column
                  sortable={true}
                  key={colIndex}
                  prop={col.toString()}
                  formatter={(row: any, column: any, cellValue: any, index: number) =>
                    formatCell(row, column, cellValue, index, colIndex)}
                  label={formatTitle(col)} />
              })
            }
          </el-table>
          <div class="text-right mt-2">
            <el-button onClick={browseAnnotations}>{btnLabel}</el-button>
          </div>
        </div>
      )
    }
  },
})

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
      const { name, submitter, group, projects, annotationCounts, metadataJson, id } = dataset?.value || {}
      const { annotationLabel, detailLabel, projectLabel, inpFdrLvls } = props
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
              <div class='dataset-opt-description'>Lorem ipsum</div>
            </div>
            <div class='dataset-overview-holder'>
              <div class='text-4xl truncate'>{annotationLabel}</div>
              <AnnotationCounts id={id} data={annotationCounts} header={inpFdrLvls}/>
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
