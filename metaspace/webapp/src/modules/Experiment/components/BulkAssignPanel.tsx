import { defineComponent, PropType, ref } from 'vue'
import { ElCard, ElInput, ElButton, ElSelect, ElOption } from '../../../lib/element-plus'
import { paletteColor } from '../api'
import { VARIABLE_KEYS, VARIABLE_LABELS } from '../composables/experimentVariables'
import type { ExperimentVariables, VariableKey } from '../composables/experimentVariables'

interface BulkDataset {
  id: string
  name: string
  /** The dataset's current value per variable (or 'mixed'/null), used to colour the chip. */
  values?: Record<VariableKey, string | null>
}

export interface BulkCopyRoisSource {
  datasetId: string
  name: string
  roiCount: number
}

const DATASET_CHIP_CLASS =
  'px-3 py-1 text-sm rounded-full border cursor-pointer select-none inline-flex items-center gap-1'

// Numbered step badge for the source-first Copy ROIs flow.
const STEP_BADGE_CLASS =
  'w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-xs font-bold inline-flex items-center justify-center'

export default defineComponent({
  name: 'BulkAssignPanel',
  props: {
    datasets: { type: Array as PropType<BulkDataset[]>, required: true },
    variables: { type: Object as PropType<ExperimentVariables>, required: true },
    assignedCount: { type: Number, default: 0 },
    copyRoisSources: { type: Array as PropType<BulkCopyRoisSource[]>, default: () => [] },
  },
  emits: ['assign', 'add-value', 'copy-rois'],
  setup(props, { emit }) {
    const activeKey = ref<VariableKey>('condition')
    const selected = ref<Set<string>>(new Set())
    const collapsed = ref(false)
    const newValue = ref('')
    const showCopyRois = ref(false)
    const copySourceId = ref<string | null>(null)

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

    const switchToVarTab = (key: VariableKey): void => {
      showCopyRois.value = false
      activeKey.value = key
    }
    // Highlighted scope button (or null once the selection no longer matches any scope exactly).
    const activeScope = ref<VariableKey | 'all' | null>(null)

    const switchToCopyRois = (): void => {
      showCopyRois.value = true
      selected.value = new Set()
      copySourceId.value = null
      activeScope.value = null
    }
    const doCopyRois = (): void => {
      if (!copySourceId.value || selected.value.size === 0) return
      emit('copy-rois', { sourceDatasetId: copySourceId.value, targetDatasetIds: [...selected.value] })
      selected.value = new Set()
      copySourceId.value = null
      activeScope.value = null
    }

    // Datasets that already hold ROIs — copying into one overwrites it.
    const roiTargetIds = (): Set<string> => new Set(props.copyRoisSources.map((s) => s.datasetId))
    const copySourceValues = (): Record<VariableKey, string | null> | undefined =>
      props.datasets.find((d) => d.id === copySourceId.value)?.values

    /** Target datasets matching a scope: every other dataset ('all'), or those sharing the
     *  source's value for one variable. The source itself is always excluded. */
    const scopeMembers = (key: VariableKey | 'all'): string[] => {
      const vals = copySourceValues()
      return props.datasets
        .filter((d) => {
          if (d.id === copySourceId.value) return false
          if (key === 'all') return true
          return vals != null && d.values?.[key] != null && d.values[key] === vals[key]
        })
        .map((d) => d.id)
    }
    // One scope per variable for which the source has a value.
    const availableScopes = (): VariableKey[] => {
      const vals = copySourceValues()
      return vals ? VARIABLE_KEYS.filter((k) => vals[k] != null) : []
    }
    const scopeKeys = (): (VariableKey | 'all')[] => ['all', ...availableScopes()]

    const setsEqual = (a: Set<string>, b: string[]): boolean => a.size === b.length && b.every((x) => a.has(x))
    // Keep a scope highlighted only while the selection still equals it exactly.
    const syncActiveScope = (): void => {
      activeScope.value =
        scopeKeys().find((k) => selected.value.size > 0 && setsEqual(selected.value, scopeMembers(k))) ?? null
    }

    const applyScope = (key: VariableKey | 'all'): void => {
      activeScope.value = key
      selected.value = new Set(scopeMembers(key))
    }
    // Targets use click-to-toggle; the source is locked out of the target grid.
    const toggleTarget = (id: string): void => {
      if (id === copySourceId.value) return
      toggle(id)
      syncActiveScope()
    }
    const onSourceChange = (val: string): void => {
      copySourceId.value = val || null
      selected.value = new Set()
      activeScope.value = null
    }
    const overwriteCount = (): number => [...selected.value].filter((id) => roiTargetIds().has(id)).length

    // Scope buttons share the dataset chips' palette. Explicit border + appearance reset so the
    // native <button> UA border doesn't show through as a dark outline.
    const scopeChipStyle = (isActive: boolean): Record<string, string> => {
      const base = { appearance: 'none', WebkitAppearance: 'none', outline: 'none' }
      return isActive
        ? {
            ...base,
            color: '#409EFF',
            border: '1px solid #409EFF',
            backgroundColor: '#ecf5ff',
            boxShadow: '0 0 0 1px #409EFF',
          }
        : { ...base, color: '#606266', border: '1px solid #dcdfe6', backgroundColor: '#ffffff' }
    }

    // Copy-mode chip colours: locked amber source, blue ring on selected targets, plain otherwise.
    const copyChipStyle = (d: BulkDataset): Record<string, string> => {
      if (d.id === copySourceId.value) {
        return {
          color: '#E6A23C',
          borderColor: '#E6A23C',
          backgroundColor: '#fdf6ec',
          boxShadow: '0 0 0 2px #E6A23C',
          cursor: 'default',
        }
      }
      const isSel = selected.value.has(d.id)
      const style: Record<string, string> = isSel
        ? { color: '#409EFF', borderColor: '#409EFF', backgroundColor: '#ecf5ff' }
        : { color: '#606266', borderColor: '#dcdfe6', backgroundColor: '#ffffff' }
      if (isSel) style.boxShadow = '0 0 0 2px #409EFF'
      return style
    }

    // Give each value its own colour (shared with the region/label-group palette) so values are
    // easy to tell apart at a glance. Light tinted background + matching border/text.
    const chipStyle = (index: number): Record<string, string> => {
      const c = paletteColor(index)
      return { color: c, borderColor: c, backgroundColor: `${c}14` }
    }

    /** Colour of a dataset's current value for the active variable, matching that value's chip. */
    const datasetAccent = (d: BulkDataset): string | null => {
      if (showCopyRois.value) return null
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
                    !showCopyRois.value && activeKey.value === key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-600',
                  ]}
                  data-test-key={`bulk-tab-${key}`}
                  onClick={() => switchToVarTab(key)}
                >
                  {VARIABLE_LABELS[key]}
                </button>
              ))}
              {props.copyRoisSources.length > 0 && (
                <button
                  class={[
                    'px-3 py-2 text-sm cursor-pointer bg-transparent border-0 border-b-2',
                    showCopyRois.value ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600',
                  ]}
                  data-test-key="bulk-tab-copy-rois"
                  onClick={switchToCopyRois}
                >
                  Copy ROIs
                </button>
              )}
            </div>

            {showCopyRois.value ? (
              <div>
                {/* Step 1 — pick the dataset whose ROIs will be copied (source-first). */}
                <div class="mb-4">
                  <div class="flex items-center gap-2 mb-2">
                    <span class={STEP_BADGE_CLASS}>1</span>
                    <span class="text-sm font-medium text-gray-700">Copy from</span>
                    <span class="text-xs text-gray-400">— the dataset whose ROIs you drew</span>
                  </div>
                  <ElSelect
                    modelValue={copySourceId.value ?? ''}
                    placeholder="Select source dataset…"
                    clearable
                    size="small"
                    style={{ width: '280px' }}
                    data-test-key="bulk-copy-rois-source"
                    onChange={onSourceChange}
                  >
                    {props.copyRoisSources.map((s) => (
                      <ElOption
                        key={s.datasetId}
                        value={s.datasetId}
                        label={`${s.name} (${s.roiCount} ROI${s.roiCount !== 1 ? 's' : ''})`}
                      />
                    ))}
                  </ElSelect>
                </div>

                {/* Step 2 — appears only once a source is chosen. */}
                {copySourceId.value && (
                  <div data-test-key="bulk-copy-to">
                    <div class="flex items-center gap-2 mb-2">
                      <span class={STEP_BADGE_CLASS}>2</span>
                      <span class="text-sm font-medium text-gray-700">Copy to</span>
                      <span class="text-xs text-gray-400">— pick a group, or tweak below</span>
                    </div>
                    <div class="flex flex-wrap gap-2 mb-3">
                      {scopeKeys().map((key) => {
                        const isActive = activeScope.value === key
                        const value = key === 'all' ? null : copySourceValues()?.[key]
                        return (
                          <button
                            key={key}
                            class={DATASET_CHIP_CLASS}
                            style={scopeChipStyle(isActive)}
                            data-test-key={`bulk-scope-${key}`}
                            onClick={() => applyScope(key)}
                          >
                            {key === 'all' ? 'All datasets' : `Same ${VARIABLE_LABELS[key].toLowerCase()}`}
                            {value && <span class="font-semibold"> · {value}</span>}{' '}
                            <span style={{ opacity: '0.6' }}>({scopeMembers(key).length})</span>
                          </button>
                        )
                      })}
                    </div>

                    <div
                      class="flex flex-wrap gap-2 p-2 bg-gray-50 border border-gray-200 rounded mb-3"
                      data-test-key="bulk-ds-chips"
                    >
                      {props.datasets.map((d) => {
                        const isSource = d.id === copySourceId.value
                        const willOverwrite = selected.value.has(d.id) && roiTargetIds().has(d.id)
                        return (
                          <span
                            key={d.id}
                            class={DATASET_CHIP_CLASS}
                            style={copyChipStyle(d)}
                            data-test-key={`bulk-chip-${d.id}`}
                            onClick={() => toggleTarget(d.id)}
                          >
                            {isSource && <span class="leading-none">★</span>}
                            <span>{d.name}</span>
                            {isSource && <span class="text-[10px] uppercase tracking-wide opacity-70">source</span>}
                            {willOverwrite && (
                              <span class="text-orange-500 leading-none" data-test-key={`bulk-chip-warn-${d.id}`}>
                                ⚠
                              </span>
                            )}
                          </span>
                        )
                      })}
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                      <ElButton
                        size="small"
                        type="primary"
                        disabled={selected.value.size === 0 || !copySourceId.value}
                        data-test-key="bulk-copy-rois-confirm"
                        onClick={doCopyRois}
                      >
                        Copy to {selected.value.size > 0 ? selected.value.size : ''}{' '}
                        {selected.value.size === 1 ? 'dataset' : 'datasets'}
                      </ElButton>
                      <ElButton size="small" data-test-key="bulk-clear" onClick={clear}>
                        Clear selection
                      </ElButton>
                    </div>

                    {overwriteCount() > 0 && (
                      <p class="text-xs text-orange-600 mt-2" data-test-key="bulk-copy-rois-warn">
                        Existing ROIs on {overwriteCount()} selected dataset
                        {overwriteCount() !== 1 ? 's' : ''} will be overwritten.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
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
          </div>
        )}
      </ElCard>
    )
  },
})
