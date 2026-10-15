import { computed, defineComponent, PropType, ref } from 'vue'
import { ElOption, ElSelect } from '../../../../lib/element-plus'
import './fields.scss'

export const EnumField = defineComponent({
  name: 'EnumField',
  props: {
    value: { type: String as PropType<string | null>, default: null },
    options: { type: Array as PropType<{ value: string; label: string; disabled?: boolean }[]>, required: true },
    placeholder: { type: String, default: 'Select' },
    inputId: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    /**
     * searchable; text that matches no option is offered as a "No match — Add …" row (Enter picks the first row)
     * and emitted as-is when chosen
     */
    allowCreate: { type: Boolean, default: false },
  },
  emits: ['input'],
  setup(props, { emit }) {
    // the typed filter text (ElSelect calls filterMethod on every keystroke and with '' when the list closes)
    const query = ref('')
    const matches = computed(() => {
      const q = query.value.trim().toLowerCase()
      return q ? props.options.filter((o) => o.label.toLowerCase().includes(q)) : props.options
    })
    // ElSelect's own allowCreate row shows only the raw text, so the create row is an option of ours
    const createText = computed(() => {
      const text = query.value.trim()
      return props.allowCreate && text && matches.value.length === 0 ? text : null
    })

    return () => (
      <ElSelect
        id={props.inputId}
        class="w-full"
        modelValue={props.value || ''}
        placeholder={props.placeholder}
        disabled={props.disabled}
        clearable
        {...(props.allowCreate
          ? {
              filterable: true,
              defaultFirstOption: true,
              filterMethod: (q: string) => (query.value = q || ''),
            }
          : {})}
        onUpdate:modelValue={(v: string) => emit('input', v || null)}
      >
        {[
          ...(props.allowCreate ? matches.value : props.options).map((opt) => (
            <ElOption key={opt.value} value={opt.value} label={opt.label} disabled={!!opt.disabled} />
          )),
          ...(createText.value
            ? [
                // `created` stops ElOption from resetting the typed text (setSelected) whenever its value changes
                <ElOption key="__create" value={createText.value} label={createText.value} created>
                  <span class="v2-ac-empty">
                    No match — <span class="v2-ac-empty__action">Add “{createText.value}”</span> (pending curation)
                  </span>
                </ElOption>,
              ]
            : []),
        ]}
      </ElSelect>
    )
  },
})
