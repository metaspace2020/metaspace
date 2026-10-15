import { defineComponent, PropType } from 'vue'
import { ElTag } from '../../../../lib/element-plus'
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
      if (s.status === 'complete') {
        return (
          <div class="v2-banner v2-banner--complete">
            <ElTag type="success" effect="dark">
              Described in schema v2
            </ElTag>
            {failed}
          </div>
        )
      }
      const denom = Math.max(s.migratedCount + s.reviewCount + s.unmappedCount, 1)
      const green = Math.round((s.migratedCount / denom) * 100)
      const amber = Math.round((s.reviewCount / denom) * 100)
      return (
        <div class="v2-banner v2-banner--partial" role="status">
          <ElTag type="warning" effect="dark" round class="flex-shrink-0">
            PARTIALLY MIGRATED
          </ElTag>
          <div class="flex-1 min-w-0">
            <div class="v2-banner__text">
              Described with legacy schema v1. Auto-migrated to v2 —{' '}
              <b>
                {s.requiredFilled} of {s.requiredTotal}
              </b>{' '}
              required fields filled, <b>{s.reviewCount}</b> need your review, <b>{s.unmappedCount}</b> legacy values
              could not be mapped.
            </div>
            <div class="v2-bar" role="img" aria-label={`${green}% migrated, ${amber}% needs review`}>
              <span class="v2-bar__seg" style={{ width: `${green}%`, background: '#2cba8f' }} />
              <span class="v2-bar__seg" style={{ width: `${amber}%`, background: '#e6a23c' }} />
            </div>
            {failed}
          </div>
        </div>
      )
    }
  },
})
