import { defineComponent, PropType } from 'vue'
import { RouterLink } from 'vue-router'
import moment from 'moment'
import { ElCheckbox, ElTable, ElTableColumn } from '../../../lib/element-plus'
import { CurationTerm, CurationTermOrderBy } from '../../../api/metadataCuration'
import { slotOption } from './slotLabels'
import './CurationTable.scss'

export interface CurationSort {
  by: CurationTermOrderBy
  desc: boolean
}

export const formatCurationDate = (date: string | null | undefined): string =>
  date ? moment(date).format('D MMM YYYY') : ''

/**
 * The row's dataset name, or its id when the dataset has no name, linking to the dataset overview. Without an id
 * (ElTable also renders each column once with an empty row) it is plain text: the route requires `dataset_id`.
 */
export const DatasetLink = (props: { term: Partial<CurationTerm> | undefined }) => {
  const datasetId = props.term?.datasetId
  const label = props.term?.datasetName || datasetId || ''
  if (!datasetId) return <span class="curation-dataset">{label}</span>
  return (
    <RouterLink
      class="curation-dataset"
      to={{
        name: 'dataset-overview',
        params: { dataset_id: datasetId },
      }}
    >
      {label}
    </RouterLink>
  )
}

export const CurationTable = defineComponent({
  name: 'CurationTable',
  props: {
    terms: { type: Array as PropType<CurationTerm[]>, required: true },
    selected: { type: Array as PropType<string[]>, required: true },
    sort: { type: Object as PropType<CurationSort>, required: true },
  },
  emits: {
    select: (ids: string[]) => Array.isArray(ids),
    review: (id: string) => typeof id === 'string',
    sort: (by: CurationTermOrderBy) => typeof by === 'string',
  },
  setup(props, { emit }) {
    const toggleRow = (id: string, checked: boolean) => {
      const rest = props.selected.filter((s) => s !== id)
      emit('select', checked ? [...rest, id] : rest)
    }
    const toggleAll = (checked: boolean) => {
      const pageIds = props.terms.map((t) => t.id)
      const rest = props.selected.filter((s) => !pageIds.includes(s))
      emit('select', checked ? [...rest, ...pageIds] : rest)
    }

    const sortHeader = (by: CurationTermOrderBy, label: string) => () => (
      <span
        class={['curation-sort', { 'curation-sort--active': props.sort.by === by }]}
        onClick={() => emit('sort', by)}
      >
        {label}
        {props.sort.by === by ? (props.sort.desc ? ' ↓' : ' ↑') : ''}
      </span>
    )

    const suggestion = (term: CurationTerm) =>
      term.suggestedLabel || term.suggestedOntologyId ? (
        <span class="curation-chip">
          {[
            term.suggestedLabel,
            term.suggestedOntologyId,
            term.suggestedScore != null ? `${Math.round(term.suggestedScore * 100)}%` : null,
          ]
            .filter(Boolean)
            .join(' ')}
        </span>
      ) : (
        <span class="curation-muted">— none</span>
      )

    return () => {
      const pageIds = props.terms.map((t) => t.id)
      const checkedOnPage = pageIds.filter((id) => props.selected.includes(id)).length
      return (
        <ElTable class="curation-table" data={props.terms} rowKey="id">
          <ElTableColumn width="48">
            {{
              header: () => (
                <ElCheckbox
                  modelValue={pageIds.length > 0 && checkedOnPage === pageIds.length}
                  indeterminate={checkedOnPage > 0 && checkedOnPage < pageIds.length}
                  disabled={pageIds.length === 0}
                  onChange={(v: boolean | string | number) => toggleAll(!!v)}
                />
              ),
              default: ({ row }: { row: CurationTerm }) => (
                <ElCheckbox
                  modelValue={props.selected.includes(row.id)}
                  onChange={(v: boolean | string | number) => toggleRow(row.id, !!v)}
                />
              ),
            }}
          </ElTableColumn>
          <ElTableColumn minWidth="160">
            {{
              header: sortHeader('TEXT', 'Typed term'),
              default: ({ row }: { row: CurationTerm }) => <span class="font-medium">{row.text}</span>,
            }}
          </ElTableColumn>
          <ElTableColumn label="Field · vocabulary" minWidth="180">
            {{
              default: ({ row }: { row: CurationTerm }) => {
                const option = slotOption(row.slot)
                return (
                  <span>
                    {option.label}
                    <span class="curation-muted">{` · ${option.vocabulary}`}</span>
                  </span>
                )
              },
            }}
          </ElTableColumn>
          <ElTableColumn label="Dataset" minWidth="180">
            {{ default: ({ row }: { row: CurationTerm }) => <DatasetLink term={row} /> }}
          </ElTableColumn>
          <ElTableColumn label="Submitter" minWidth="140">
            {{ default: ({ row }: { row: CurationTerm }) => <span>{row.submitter?.name}</span> }}
          </ElTableColumn>
          <ElTableColumn minWidth="120">
            {{
              header: sortHeader('FIRST_SUBMITTED', 'Submitted'),
              default: ({ row }: { row: CurationTerm }) => <span>{formatCurationDate(row.submittedAt)}</span>,
            }}
          </ElTableColumn>
          <ElTableColumn label="Suggested match" minWidth="200">
            {{ default: ({ row }: { row: CurationTerm }) => suggestion(row) }}
          </ElTableColumn>
          <ElTableColumn width="100">
            {{
              default: ({ row }: { row: CurationTerm }) => (
                <a
                  class="curation-review"
                  href="#"
                  onClick={(e: Event) => {
                    e.preventDefault()
                    emit('review', row.id)
                  }}
                >
                  Review ›
                </a>
              ),
            }}
          </ElTableColumn>
        </ElTable>
      )
    }
  },
})

export default CurationTable
