import { defineComponent } from 'vue'
import { ElTable, ElTableColumn, ElButton, ElTooltip, ElIcon } from '../../../lib/element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { DatasetAnnotationCount } from '../../../api/dataset'
import { encodeParams } from '../../Filters'
import { useRouter } from 'vue-router'
import RouterLink from '../../../components/RouterLink'

interface AnnotationCountTableData {
  name: string
  [key: string]: any // dynamic keys according to fdrs
}

interface AnnotationCountTableProps {
  id: string
  sumRowLabel: string
  btnLabel: string
  title: string
  data: DatasetAnnotationCount[]
  header: string[]
  headerTitleSuffix: string
}

export const AnnotationCountTable = defineComponent({
  name: 'AnnotationCountTable',
  props: {
    id: { type: String, default: '' },
    title: { type: String, default: '# of annotations with FDR% <=' },
    sumRowLabel: { type: String, default: 'Total Annotations' },
    btnLabel: { type: String, default: 'Browse annotations' },
    data: { type: Array, default: () => [] },
    header: { type: Array, default: () => [5, 10, 20, 50] },
    headerTitleSuffix: { type: String, default: '%' },
  },
  setup(props: AnnotationCountTableProps) {
    const router = useRouter()
    const annotationsLink = (datasetId: string, database?: string, fdrLevel?: number) => {
      const query = {
        database,
        fdrLevel,
        datasetIds: [datasetId],
      }
      // delete undefined so that filter do not replace the nulls and make the navigation back weird
      if (!database) {
        delete query.database
      }
      if (!fdrLevel) {
        delete query.fdrLevel
      }

      return {
        name: 'dataset-annotations',
        params: { dataset_id: datasetId },
        state: { from: 'dataset-overview' },
        query: encodeParams(query),
      }
    }

    const mountTableData = (data: DatasetAnnotationCount[], header: string[]): AnnotationCountTableData[] => {
      if (!data) {
        return []
      }

      return data.map((item: DatasetAnnotationCount) => {
        const obj = {} as AnnotationCountTableData
        obj.id = item?.databaseId
        obj.name = `${item?.dbName}${item?.dbVersion ? `-${item?.dbVersion}` : ''}`
        obj.isTargeted = !!item?.isTargeted
        obj.total = item?.total ?? 0
        header.forEach((headerEl: string) => {
          obj[headerEl] = Array.isArray(item?.counts)
            ? ((item.counts.find((count: any) => count.level === headerEl) || {}) as any).n
            : '-'
        })
        return obj
      })
    }

    const browseAnnotations = () => {
      const { id } = props
      router.push(annotationsLink(id))
    }

    const formatTitle = (col: number | string) => {
      const { headerTitleSuffix } = props
      if (col === 'name') {
        return 'Database'
      }
      if (col === 'total') {
        return 'Total'
      }
      return `${col}${headerTitleSuffix}`
    }

    const targetedTooltip =
      'Targeted database (fewer than 1000 molecules): FDR is not calculated, so no annotations are ' +
      'reported per FDR threshold. The Total column shows the full annotation count.'

    const formatCell = (row: any, column: any, cellValue: any, rowIndex: number, colIndex: number) => {
      const { id, header } = props
      if (colIndex === 0) {
        return (
          <span class="inline-flex items-center justify-center gap-1">
            <RouterLink to={annotationsLink(id?.toString(), row?.id, undefined)}>{cellValue}</RouterLink>
            {row?.isTargeted && (
              <ElTooltip content={targetedTooltip} placement="top" popperClass="max-w-sm">
                <ElIcon class="text-gray-400 cursor-help">
                  <QuestionFilled />
                </ElIcon>
              </ElTooltip>
            )}
          </span>
        )
      }

      // Total column (last column)
      if (column?.property === 'total') {
        const fdrLevel = row?.isTargeted ? undefined : Math.max(...header.map(Number)) / 100
        return <RouterLink to={annotationsLink(id?.toString(), row?.id, fdrLevel)}>{row?.total}</RouterLink>
      }

      // Targeted databases have no FDR, so per-threshold cells are not meaningful.
      if (row?.isTargeted) {
        return <span class="text-gray-400">—</span>
      }

      return (
        <RouterLink to={annotationsLink(id?.toString(), row?.id, parseInt(column?.property, 10) / 100)}>
          {cellValue}
        </RouterLink>
      )
    }

    const getSummaries = (param: any) => {
      const { columns, data } = param
      const { header } = props
      const maxFdr = Math.max(...header.map(Number)) / 100
      const nonTargeted = data.filter((row: any) => !row?.isTargeted)
      const hasTargeted = data.some((row: any) => row?.isTargeted)
      // The per-FDR-level sums exclude targeted (no-FDR) databases, but a dataset-wide FDR filter
      // would include their fdr=-1 annotations, and the annotation browser only filters by a single
      // database. So an FDR-level summary link can only be made accurate when either:
      //  - there are no targeted DBs (a dataset-wide FDR filter is exact), or
      //  - there is exactly one non-targeted DB (scope the link to it).
      // Otherwise (targeted DBs mixed with zero or several non-targeted DBs) no single link reproduces
      // the displayed count, so the FDR-level cells are shown as plain text. Targeted annotations are
      // represented only in the Total column (which links to "all databases at the highest FDR level").
      const canLinkFdrSummary = !hasTargeted || nonTargeted.length === 1
      const fdrSummaryDbId = hasTargeted && nonTargeted.length === 1 ? nonTargeted[0].id : undefined
      return columns.map((col: any, colIndex: number) => {
        if (colIndex === 0) {
          return props.sumRowLabel
        }

        // Total column (last column) — sum the per-database totals. This equals "all databases at
        // the highest FDR level" (targeted annotations, fdr=-1, pass every threshold), so the
        // linked annotation list matches the displayed number.
        if (col?.property === 'total') {
          const total = data.reduce((acc: number, row: any) => acc + (row?.total || 0), 0)
          return (
            <RouterLink
              key={colIndex}
              from="dataset-overview"
              to={annotationsLink(props.id?.toString(), undefined, maxFdr)}
            >
              {total}
            </RouterLink>
          )
        }

        const currentFDR = props.header[colIndex - 1]
        const sum = data.reduce((acc: number, row: any) => acc + (row[currentFDR] || 0), 0)

        // No single annotation-browser link can reproduce this per-level sum (see above) — render
        // plain text instead of a link that would open a mismatching count.
        if (!canLinkFdrSummary) {
          return <span>{sum}</span>
        }

        return (
          <RouterLink
            key={colIndex}
            from="dataset-overview"
            to={annotationsLink(props.id?.toString(), fdrSummaryDbId, parseInt(currentFDR, 10) / 100)}
          >
            {sum}
          </RouterLink>
        )
      })
    }

    return () => {
      const { data, header, sumRowLabel, btnLabel, title } = props
      const tableData = mountTableData(data, header)
      return (
        <div class="relative text-center">
          <h4>{title}</h4>
          <ElTable
            data={tableData}
            show-summary={true}
            sum-text={sumRowLabel}
            summary-method={getSummaries}
            style={{ width: '100%', marginTop: 20 }}
          >
            {['name']
              .concat(header)
              .concat(['total'])
              .map((col, colIndex) => {
                return (
                  <ElTableColumn
                    sortable={true}
                    key={colIndex}
                    prop={col.toString()}
                    formatter={(row: any, column: any, cellValue: any, index: number) =>
                      formatCell(row, column, cellValue, index, colIndex)
                    }
                    label={formatTitle(col)}
                  />
                )
              })}
          </ElTable>
          <div class="text-right mt-2">
            <ElButton onClick={browseAnnotations}>{btnLabel}</ElButton>
          </div>
        </div>
      )
    }
  },
})
