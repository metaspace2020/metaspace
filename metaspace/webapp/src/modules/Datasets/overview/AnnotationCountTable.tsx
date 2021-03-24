import { defineComponent } from '@vue/composition-api'
import Vue from 'vue'
import { Table, TableColumn, Button } from '../../../lib/element-ui'
import { DatasetAnnotationCount } from '../../../api/dataset'
import { encodeParams } from '../../Filters'

const RouterLink = Vue.component('router-link')

interface AnnotationCountTableData{
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

export const AnnotationCountTable = defineComponent<AnnotationCountTableProps>({
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
  setup(props, ctx) {
    const annotationsLink = (datasetId: string, database?: string, fdrLevel?: number) => ({
      name: 'dataset-annotations',
      params: { datasetId },
      query: encodeParams({
        database,
        fdrLevel,
      }),
    })

    const mountTableData = (data: DatasetAnnotationCount[], header: string[]) : AnnotationCountTableData[] => {
      if (!data) { return [] }

      return data.map((item: DatasetAnnotationCount) => {
        const obj = {} as AnnotationCountTableData
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
        <RouterLink to={annotationsLink(id?.toString(), row?.id,
          parseInt(column?.property, 10) / 100)}>
          {cellValue}
        </RouterLink>
      )
    }

    return () => {
      const { data, header, sumRowLabel, btnLabel, title } = props
      const tableData = mountTableData(data, header)

      return (
        <div class="relative text-center">
          <h4>{title}</h4>
          <Table
            data={tableData}
            show-summary={true}
            sum-text={sumRowLabel}
            style="width: 100%; margin-top: 20px">
            {
              ['name'].concat(header).map((col, colIndex) => {
                return <TableColumn
                  sortable={true}
                  key={colIndex}
                  prop={col.toString()}
                  formatter={(row: any, column: any, cellValue: any, index: number) =>
                    formatCell(row, column, cellValue, index, colIndex)}
                  label={formatTitle(col)} />
              })
            }
          </Table>
          <div class="text-right mt-2">
            <Button onClick={browseAnnotations}>{btnLabel}</Button>
          </div>
        </div>
      )
    }
  },
})
