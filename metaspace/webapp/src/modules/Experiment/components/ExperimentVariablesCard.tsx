import { defineComponent, PropType } from 'vue'
import { ElCard, ElSelect, ElOption } from '../../../lib/element-plus'
import { VARIABLE_KEYS, VARIABLE_LABELS, REQUIRED_VARIABLE_KEYS } from '../composables/experimentVariables'
import type { ExperimentVariables, VariableKey } from '../composables/experimentVariables'

/** Per-field example placeholders for the tag inputs. */
const PLACEHOLDERS: Record<VariableKey, string> = {
  condition: 'e.g. control, treated — press Enter',
  biologicalReplicateId: 'e.g. rep1, rep2, rep3',
  technicalReplicateId: 'e.g. scan1, scan2',
  batchId: 'e.g. batch1, batch2',
}

/** Tailwind classes for the "optional" badge — extracted to keep the JSX line under max-len. */
const OPTIONAL_BADGE_CLASS =
  'ml-2 align-middle text-[10px] uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1.5 py-0.5'

export default defineComponent({
  name: 'ExperimentVariablesCard',
  props: {
    modelValue: { type: Object as PropType<ExperimentVariables>, required: true },
  },
  emits: ['change-variable'],
  setup(props, { emit }) {
    const onChange = (key: VariableKey, values: string[]): void => {
      emit('change-variable', { key, values })
    }
    return () => (
      <ElCard class="mb-6" shadow="never" data-test-key="experiment-variables-card">
        <h2 class="text-lg mb-2">Experimental variables</h2>
        <p class="text-sm text-gray-500 mb-3">Define each value once, then assign it to datasets below.</p>
        <div class="space-y-3">
          {VARIABLE_KEYS.map((key) => (
            <div key={key} class="flex items-center gap-3">
              <label class="text-sm w-48 shrink-0">
                {VARIABLE_LABELS[key]}
                {REQUIRED_VARIABLE_KEYS.includes(key) ? (
                  <span class="text-red-500 ml-0.5" title="required" aria-label="required">
                    *
                  </span>
                ) : (
                  <span class={OPTIONAL_BADGE_CLASS}>optional</span>
                )}
              </label>
              <ElSelect
                class="flex-1"
                multiple
                filterable
                allow-create
                default-first-option
                modelValue={props.modelValue[key]}
                placeholder={PLACEHOLDERS[key]}
                data-test-key={`variable-input-${key}`}
                onChange={(vals: string[]) => onChange(key, vals)}
              >
                {props.modelValue[key].map((v) => (
                  <ElOption key={v} value={v} label={v} />
                ))}
              </ElSelect>
            </div>
          ))}
        </div>
      </ElCard>
    )
  },
})
