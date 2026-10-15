import { defineComponent, PropType, ref } from 'vue'
import { ElButton, ElDropdown, ElDropdownItem, ElDropdownMenu } from '../../../../lib/element-plus'
import { fieldByKey } from '../formDefinition'
import { FieldKey, UnmappedRow } from '../types'
import './V2Form.scss'

export const UnmappedPanel = defineComponent({
  name: 'UnmappedPanel',
  props: {
    rows: { type: Array as PropType<UnmappedRow[]>, required: true },
    copied: { type: Array as PropType<string[]>, required: true },
    dismissed: { type: Array as PropType<string[]>, required: true },
    copiedTargets: { type: Object as PropType<Partial<Record<string, FieldKey>>>, required: true },
  },
  emits: ['copy', 'dismiss', 'restore', 'undo'],
  setup(props, { emit }) {
    const expanded = ref(false)
    return () => {
      const open = props.rows.filter(
        (r) => !props.copied.includes(r.legacyKey) && !props.dismissed.includes(r.legacyKey)
      )
      const nCopied = props.rows.filter((r) => props.copied.includes(r.legacyKey)).length
      const nDismissed = props.rows.filter((r) => props.dismissed.includes(r.legacyKey)).length
      if (open.length === 0 && !expanded.value) {
        return (
          <div class="v2-unmapped v2-unmapped--done">
            <div class="v2-unmapped__head">
              <span class="v2-unmapped__head-help">
                All legacy values handled — {nCopied} copied, {nDismissed} dismissed.{' '}
                <button type="button" class="v2-unmapped__show underline" onClick={() => (expanded.value = true)}>
                  Show
                </button>
              </span>
            </div>
          </div>
        )
      }
      return (
        <div class="v2-unmapped">
          <div class="v2-unmapped__head">
            <span class="v2-unmapped__head-text">
              <span aria-hidden="true">▼ </span>
              {open.length} legacy {open.length === 1 ? 'value' : 'values'} not mapped to the new schema
            </span>
            <span class="v2-unmapped__head-help">
              — carry them into a v2 field or dismiss. The legacy record is never changed.
            </span>
          </div>
          {props.rows.map((row) => {
            const isCopied = props.copied.includes(row.legacyKey)
            const isDismissed = props.dismissed.includes(row.legacyKey)
            return (
              <div key={row.legacyKey} class="v2-unmapped__row">
                <div>
                  <div class="v2-unmapped__caption">Legacy field</div>
                  <div class="v2-unmapped__label">{row.label}</div>
                </div>
                <div>
                  <div class="v2-unmapped__caption">Value</div>
                  <div class="v2-unmapped__value">
                    <code class="v2-unmapped__code">{row.raw}</code>
                    {row.hint && <span class="v2-unmapped__hint">{row.hint}</span>}
                  </div>
                </div>
                <div class="v2-unmapped__actions">
                  {isCopied && (
                    <span style="color: #e6a23c">
                      copied to{' '}
                      {props.copiedTargets[row.legacyKey]
                        ? fieldByKey(props.copiedTargets[row.legacyKey]!).label
                        : 'a field'}{' '}
                      ·{' '}
                      <button
                        type="button"
                        class="v2-unmapped__undo"
                        onClick={() => emit('undo', props.copiedTargets[row.legacyKey])}
                      >
                        undo
                      </button>
                    </span>
                  )}
                  {isDismissed && (
                    <span style="color: #617f98">
                      dismissed ·{' '}
                      <button type="button" class="v2-unmapped__restore" onClick={() => emit('restore', row.legacyKey)}>
                        restore
                      </button>
                    </span>
                  )}
                  {!isCopied && !isDismissed && (
                    <>
                      <ElDropdown
                        trigger="click"
                        onCommand={(target: FieldKey) => emit('copy', row.legacyKey, target)}
                        v-slots={{
                          dropdown: () => (
                            <ElDropdownMenu>
                              {row.targets.map((t) => (
                                <ElDropdownItem key={t} command={t} class="v2-unmapped__target">
                                  {fieldByKey(t).label}
                                </ElDropdownItem>
                              ))}
                            </ElDropdownMenu>
                          ),
                        }}
                      >
                        <ElButton size="small" type="primary" plain>
                          Copy to… ▾
                        </ElButton>
                      </ElDropdown>
                      <ElButton
                        size="small"
                        class="v2-unmapped__dismiss"
                        onClick={() => emit('dismiss', row.legacyKey)}
                      >
                        Dismiss
                      </ElButton>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )
    }
  },
})
