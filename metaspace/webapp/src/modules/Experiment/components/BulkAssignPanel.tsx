import { defineComponent, PropType, ref } from 'vue'
import { ElCard, ElInput, ElButton } from '../../../lib/element-plus'
import { paletteColor } from '../api'
import { VARIABLE_KEYS, VARIABLE_LABELS } from '../composables/experimentVariables'
import type { ExperimentVariables, VariableKey } from '../composables/experimentVariables'

interface BulkDataset {
  id: string
  name: string
  /** The dataset's current value per variable (or 'mixed'/null), used to colour the chip. */
  values?: Record<VariableKey, string | null>
}

const DATASET_CHIP_CLASS =
  'px-3 py-1 text-sm rounded-full border cursor-pointer select-none inline-flex items-center gap-1'

export default defineComponent({
  name: 'BulkAssignPanel',
  props: {
    datasets: { type: Array as PropType<BulkDataset[]>, required: true },
    variables: { type: Object as PropType<ExperimentVariables>, required: true },
    assignedCount: { type: Number, default: 0 },
  },
  emits: ['assign', 'add-value'],
  setup(props, { emit }) {
    const activeKey = ref<VariableKey>('condition')
    const selected = ref<Set<string>>(new Set())
    const collapsed = ref(false)
    const newValue = ref('')

    const toggle = (id: string): void => {
      const next = new Set(selected.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      selected.value = next
    }
    const assign = (value: string): void => {
      if (selected.value.size === 0 || !value) return
      emit('assign', { key: activeKey.value, value, datasetIds: [...selected.value] })
      selected.value = new Set() // reset the selection so the next group starts fresh
    }
    const addNew = (): void => {
      const v = newValue.value.trim()
      if (!v) return
      emit('add-value', { key: activeKey.value, value: v })
      newValue.value = ''
    }
    const clear = (): void => {
      selected.value = new Set()
    }
    // Clear one dataset's value for the active variable (empty assign → page sets it to ''/null).
    const clearOne = (datasetId: string): void => {
      emit('assign', { key: activeKey.value, value: '', datasetIds: [datasetId] })
    }

    // Give each value its own colour (shared with the region/label-group palette) so values are
    // easy to tell apart at a glance. Light tinted background + matching border/text.
    const chipStyle = (index: number): Record<string, string> => {
      const c = paletteColor(index)
      return { color: c, borderColor: c, backgroundColor: `${c}14` }
    }

    /** Colour of a dataset's current value for the active variable, matching that value's chip. */
    const datasetAccent = (d: BulkDataset): string | null => {
      const value = d.values?.[activeKey.value]
      if (!value || value === 'mixed') return null
      const idx = props.variables[activeKey.value].indexOf(value)
      return idx >= 0 ? paletteColor(idx) : null
    }

    /** Dataset chip: tinted with its assigned value's colour; selection adds a ring. */
    const datasetChipStyle = (d: BulkDataset): Record<string, string> => {
      const accent = datasetAccent(d)
      const isSel = selected.value.has(d.id)
      const style: Record<string, string> = accent
        ? { color: accent, borderColor: accent, backgroundColor: `${accent}14` }
        : isSel
        ? { color: '#409EFF', borderColor: '#409EFF', backgroundColor: '#ecf5ff' }
        : { color: '#606266', borderColor: '#dcdfe6', backgroundColor: '#ffffff' }
      if (isSel) style.boxShadow = `0 0 0 2px ${accent ?? '#409EFF'}`
      return style
    }

    return () => (
      <ElCard class="mb-6" shadow="never" data-test-key="bulk-assign-card">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-lg">Bulk assign</h2>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500" data-test-key="bulk-progress">
              {props.assignedCount} / {props.datasets.length} datasets fully assigned
            </span>
            <button
              class="text-sm text-blue-600 cursor-pointer bg-transparent border-0 p-0"
              data-test-key="bulk-collapse"
              onClick={() => (collapsed.value = !collapsed.value)}
            >
              {collapsed.value ? 'Expand' : 'Collapse'}
            </button>
          </div>
        </div>
        {!collapsed.value && (
          <div>
            <div class="flex gap-1 border-b border-gray-200 mb-3">
              {VARIABLE_KEYS.map((key) => (
                <button
                  key={key}
                  class={[
                    'px-3 py-2 text-sm cursor-pointer bg-transparent border-0 border-b-2',
                    activeKey.value === key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600',
                  ]}
                  data-test-key={`bulk-tab-${key}`}
                  onClick={() => (activeKey.value = key)}
                >
                  {VARIABLE_LABELS[key]}
                </button>
              ))}
            </div>
            <p class="text-sm text-gray-400 mb-2">
              Click datasets to select, then click a value to assign it to all of their regions.
            </p>
            <div
              class="flex flex-wrap gap-2 p-2 bg-gray-50 border border-gray-200 rounded mb-3"
              data-test-key="bulk-ds-chips"
            >
              {props.datasets.map((d) => (
                <span
                  key={d.id}
                  class={DATASET_CHIP_CLASS}
                  style={datasetChipStyle(d)}
                  data-test-key={`bulk-chip-${d.id}`}
                  onClick={() => toggle(d.id)}
                >
                  <span>{d.name}</span>
                  {d.values?.[activeKey.value] != null && (
                    <button
                      class="leading-none bg-transparent border-0 p-0 cursor-pointer opacity-60 hover:opacity-100"
                      style={{ color: 'inherit' }}
                      data-test-key={`bulk-chip-clear-${d.id}`}
                      aria-label={`Clear ${VARIABLE_LABELS[activeKey.value]} for ${d.name}`}
                      onClick={(e: MouseEvent) => {
                        e.stopPropagation()
                        clearOne(d.id)
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm text-gray-600 mr-1">Assign selected →</span>
              {props.variables[activeKey.value].map((v, i) => (
                <span
                  key={v}
                  class="px-3 py-1 text-sm rounded-full border cursor-pointer"
                  style={chipStyle(i)}
                  data-test-key={`bulk-value-${v}`}
                  onClick={() => assign(v)}
                >
                  {v}
                </span>
              ))}
              <ElInput
                class="w-40"
                size="small"
                modelValue={newValue.value}
                placeholder="+ new value"
                data-test-key="bulk-new-value"
                onUpdate:modelValue={(val: string) => (newValue.value = val)}
                onKeyup={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') addNew()
                }}
              />
              <ElButton size="small" data-test-key="bulk-clear" onClick={clear}>
                Clear selection
              </ElButton>
            </div>
          </div>
        )}
      </ElCard>
    )
  },
})
