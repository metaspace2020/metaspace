import { defineComponent, PropType } from 'vue'
import { ElSelect, ElOption } from '../../../lib/element-plus'

export type MatchMode = 'MANUAL' | 'NAME' | 'GROUP'

export default defineComponent({
  name: 'MatchModeSelector',
  props: {
    modelValue: { type: String as PropType<MatchMode>, required: true },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => (
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
    )
  },
})
