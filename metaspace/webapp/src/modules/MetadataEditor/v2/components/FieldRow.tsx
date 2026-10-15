import { defineComponent, onUpdated, PropType, ref, watchEffect } from 'vue'
import { ElFormItem } from '../../../../lib/element-plus'
import { FieldDef } from '../formDefinition'
import { FieldReport } from '../types'
import { FieldProvenance } from './FieldProvenance'
import './fields.scss'

export const FieldRow = defineComponent({
  name: 'FieldRow',
  props: {
    def: { type: Object as PropType<FieldDef>, required: true },
    report: { type: Object as PropType<FieldReport | undefined>, default: undefined },
    acknowledged: { type: Boolean, default: false },
    error: { type: String as PropType<string | undefined>, default: undefined },
    required: { type: Boolean, default: false },
    /** a submit was attempted while this required field was empty */
    showRequired: { type: Boolean, default: false },
    inputId: { type: String, required: true },
  },
  setup(props, { slots }) {
    const wrapper = ref<HTMLElement | null>(null)

    // aria-invalid belongs on the control itself (input, textarea or chip button), which lives in the
    // slot, so it is set after render rather than on the wrapper.
    const applyInvalid = () => {
      const invalid = props.report?.state === 'required-empty' || !!props.error || props.showRequired
      const control = wrapper.value?.querySelector('input, textarea, [role="button"]')
      if (!control) return
      if (invalid) control.setAttribute('aria-invalid', 'true')
      else control.removeAttribute('aria-invalid')
    }
    watchEffect(applyInvalid, { flush: 'post' })
    // the slotted control can be swapped (chip <-> autocomplete) without any prop change
    onUpdated(applyInvalid)

    return () => {
      const state = props.report?.state
      const isRequiredEmpty = state === 'required-empty' || props.showRequired
      const hint =
        props.report?.note ||
        (props.report?.source?.raw ? `from legacy "${props.report.source.raw}"` : null) ||
        (props.showRequired ? 'Required' : null)
      return (
        <ElFormItem
          class={['v2-field', { 'is-error': isRequiredEmpty || !!props.error }]}
          error={props.error}
          v-slots={{
            label: () => (
              <label for={props.inputId} class="flex items-center">
                <span>{props.def.label}</span>
                {props.required && (
                  <span class="v2-required" aria-hidden="true">
                    *
                  </span>
                )}
                {state && <FieldProvenance state={state} acknowledged={props.acknowledged} />}
              </label>
            ),
          }}
        >
          <div ref={wrapper} class="w-full">
            {slots.default?.()}
            {hint && <div class={['v2-hint', { 'v2-hint--danger': isRequiredEmpty }]}>{hint}</div>}
          </div>
        </ElFormItem>
      )
    }
  },
})
