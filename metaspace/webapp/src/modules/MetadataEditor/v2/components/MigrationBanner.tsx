import { defineComponent, PropType } from 'vue'
import { StatusSummary } from '../status'
import './V2Form.scss'

/** Page-level banner shown above the Metadata card while a legacy dataset is being migrated to v2. */
export const MigrationBanner = defineComponent({
  name: 'MigrationBanner',
  props: {
    status: { type: Object as PropType<StatusSummary>, required: true },
    failedSlots: { type: Array as PropType<string[]>, default: () => [] },
  },
  setup(props) {
    return () => {
      const s = props.status
      const failed = props.failedSlots.length > 0 && (
        <div class="v2-banner__note">
          Term lookup failed for: {props.failedSlots.join(', ')}. Those values were kept as typed.
        </div>
      )
      return (
        <div class="v2-banner" role="status">
          <div class="flex-1 min-w-0">
            <div class="v2-banner__text">
              <b>{s.migratedCount}</b> values migrated from the legacy record,{' '}
              <b>
                {s.requiredFilled} of {s.requiredTotal}
              </b>{' '}
              required fields filled.
            </div>
            {failed}
          </div>
        </div>
      )
    }
  },
})
