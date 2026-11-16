import { defineComponent } from 'vue'
import { ElButton, ElMessageBox } from '../../../lib/element-plus'

export const BulkActionBar = defineComponent({
  name: 'BulkActionBar',
  props: {
    count: { type: Number, required: true },
    busy: { type: Boolean, default: false },
    skipped: { type: Number, default: null },
  },
  emits: ['approve', 'mapSuggested', 'reject'],
  setup(props, { emit }) {
    const askReject = async () => {
      try {
        const { value } = await ElMessageBox.prompt('Reason shown for the rejected terms', 'Reject terms', {
          confirmButtonText: 'Reject',
          cancelButtonText: 'Cancel',
          inputValidator: (text: string) => !!text && text.trim() !== '',
          inputErrorMessage: 'A reason is required',
        })
        emit('reject', String(value).trim())
      } catch (err) {
        // cancelled
      }
    }

    return () => {
      if (props.count === 0) return null
      return (
        <div class="curation-bulk-bar">
          <span class="curation-bulk-bar__count">{props.count} selected</span>
          <ElButton type="primary" size="small" disabled={props.busy} onClick={() => emit('approve')}>
            ✓ Approve as new term
          </ElButton>
          <ElButton size="small" disabled={props.busy} onClick={() => emit('mapSuggested')}>
            Map to suggested
          </ElButton>
          <ElButton size="small" disabled={props.busy} onClick={askReject}>
            Reject…
          </ElButton>
          <span class="curation-bulk-bar__hint">Bulk actions apply the same decision to every selected row</span>
          {props.skipped != null && props.skipped > 0 && (
            <span class="curation-bulk-bar__skipped">{props.skipped} skipped (no suggestion)</span>
          )}
        </div>
      )
    }
  },
})
