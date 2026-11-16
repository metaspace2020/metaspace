import { defineComponent, PropType } from 'vue'
import { ElRadioButton, ElRadioGroup } from '../../../../lib/element-plus'
import './V2Form.scss'

/**
 * Button group that swaps the Metadata card body between the editable v2 form and the read-only legacy
 * record. `legacyNote` (the record's provenance, one line) is shown next to it in the legacy view.
 */
export const SchemaSwitch = defineComponent({
  name: 'SchemaSwitch',
  props: {
    modelValue: { type: String as PropType<'v2' | 'legacy'>, required: true },
    legacyNote: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const note = () =>
      props.modelValue === 'v2'
        ? 'Switch to compare against the original record; the v2 form keeps your edits.'
        : props.legacyNote || 'Legacy record · read-only; not changed by anything you do in the v2 form.'
    return () => (
      // one row of fixed height in both views: the note is a single line and ellipsizes instead of wrapping
      <div class="v2-switch">
        <ElRadioGroup
          modelValue={props.modelValue}
          size="small"
          onUpdate:modelValue={(v: 'v2' | 'legacy') => emit('update:modelValue', v)}
        >
          <ElRadioButton label="v2">
            New schema v2 <span class="v2-switch__sub">· editable</span>
          </ElRadioButton>
          <ElRadioButton label="legacy">
            Legacy record v1 <span class="v2-switch__sub">· read-only</span>
          </ElRadioButton>
        </ElRadioGroup>
        <span class="v2-switch__note" title={note()}>
          {note()}
        </span>
      </div>
    )
  },
})
