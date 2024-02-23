import { defineComponent, reactive } from 'vue'
import { ElSelect, ElOption, ElButton, ElTooltip } from 'element-plus'
import './SortDropdown.css'
import { Sort, SortUp, SortDown } from '@element-plus/icons-vue'

const enum SortingOrder {
  Unsorted = '',
  Asc = 'ASCENDING',
  Desc = 'DESCENDING',
}

interface Props {
  options: Array<{
    value: string
    label: string
  }>
  defaultOption: string
  defaultSorting: SortingOrder
  size: string
  clearable: boolean
  tooltipPlacement: string
}

interface State {
  value: string
  orderBy: SortingOrder
}

export default defineComponent({
  name: 'SortDropdown',
  props: {
    options: {
      type: Array as () => Props['options'],
      default: () => [
        {
          value: 'ORDER_BY_DATE',
          label: 'Last updated',
        },
        {
          value: 'ORDER_BY_UP_DATE',
          label: 'Upload date',
        },
        {
          value: 'ORDER_BY_NAME',
          label: 'Dataset name',
        },
        {
          value: 'ORDER_BY_DS_SUBMITTER_NAME',
          label: 'Submitter name',
        },
        {
          value: 'ORDER_BY_ANNOTATION_COUNTS',
          label: 'Annotation count',
        },
      ],
    },
    defaultOption: {
      type: String,
      default: '',
    },
    defaultSorting: {
      type: String as () => SortingOrder,
      default: SortingOrder.Unsorted,
    },
    size: {
      type: String,
      default: 'small',
    },
    clearable: {
      type: Boolean,
      default: true,
    },
    tooltipPlacement: {
      type: String,
      default: 'right',
    },
  },
  emits: ['sort'],
  setup(props: Props, { emit }) {
    const state: State = reactive({
      value: props.defaultOption,
      orderBy: props.defaultSorting,
    })

    const handleSort = () => {
      if (!state.value) return

      state.orderBy =
        state.orderBy === SortingOrder.Unsorted
          ? SortingOrder.Desc
          : state.orderBy === SortingOrder.Asc
          ? SortingOrder.Desc
          : SortingOrder.Asc

      emit('sort', state.value, state.orderBy)
    }

    const handleSelect = (value: string) => {
      state.value = value
      state.orderBy = !value
        ? SortingOrder.Unsorted
        : state.orderBy === SortingOrder.Unsorted
        ? SortingOrder.Desc
        : state.orderBy
      emit('sort', state.value, state.orderBy)
    }

    return () => (
      <div class="flex flex-row sort-dp-container">
        <ElSelect
          size={props.size as any}
          modelValue={state.value}
          placeholder="Sort by"
          onChange={handleSelect}
          clearable={props.clearable}
        >
          {props.options.map((opt) => (
            <ElOption label={opt.label} value={opt.value} />
          ))}
        </ElSelect>
        <div class="el-input-group__append sort-dp-btn">
          <ElTooltip content="Sorting order" placement={props.tooltipPlacement as any}>
            <ElButton
              size={props.size as any}
              class={`btn-internal ${!state.value ? 'cursor-not-allowed' : ''}`}
              icon={
                state.orderBy === SortingOrder.Unsorted ? (
                  <Sort />
                ) : state.orderBy === SortingOrder.Desc ? (
                  <SortDown />
                ) : (
                  <SortUp />
                )
              }
              onClick={handleSort}
            />
          </ElTooltip>
        </div>
      </div>
    )
  },
})
