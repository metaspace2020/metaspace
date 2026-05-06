import { defineComponent, PropType } from 'vue'
import { ElSelect, ElOption, ElTag } from '../../../lib/element-plus'

export type MatchMode = 'MANUAL' | 'NAME'

export interface MappingChip {
  id: string
  label: string
}

export default defineComponent({
  name: 'MatchModeSelector',
  props: {
    modelValue: { type: String as PropType<MatchMode>, required: true },
    mappings: { type: Array as PropType<MappingChip[]>, default: () => [] },
  },
  emits: ['update:modelValue', 'remove-mapping'],
  setup(props, { emit }) {
    return () => (
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <label class="text-sm w-48">Match region labels by:</label>
          <ElSelect
            modelValue={props.modelValue}
            data-test-key="match-mode-select"
            onChange={(v: MatchMode) => emit('update:modelValue', v)}
          >
            <ElOption value="MANUAL" label="Manual mapping" />
            <ElOption value="NAME" label="Name" />
          </ElSelect>
        </div>
        <div>
          <label class="text-sm">Mappings:</label>
          <div class="flex flex-wrap gap-2 mt-1">
            {props.mappings.map((m) => (
              <ElTag
                key={m.id}
                closable
                data-test-key={`mapping-chip-${m.id}`}
                onClose={() => emit('remove-mapping', m.id)}
              >
                <span data-test-key={`mapping-chip-${m.id}-remove`} onClick={() => emit('remove-mapping', m.id)}>
                  {m.label}
                </span>
              </ElTag>
            ))}
          </div>
        </div>
      </div>
    )
  },
})
