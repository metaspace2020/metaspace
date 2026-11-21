import { defineComponent } from 'vue'
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue'
import { ElIcon } from '../lib/element-plus'
import './RoiSettings.scss'

/**
 * Full-width collapsible caption of the ROI panel: title, optional lighter count, optional slot (e.g. an info icon)
 * and a chevron at the far right. The whole row toggles; a real button around title + count gives keyboard users
 * the same action without nesting the slotted control inside a button. Presentational: the parent owns `collapsed`.
 * With `collapsible: false` (an empty section) the caption is static text: no chevron, no button, no toggle.
 */
export default defineComponent({
  name: 'RoiSectionHeader',
  props: {
    title: { type: String, required: true },
    count: { type: Number, default: undefined },
    collapsed: { type: Boolean, default: false },
    collapsible: { type: Boolean, default: true },
  },
  emits: {
    toggle: () => true,
  },
  setup(props, { emit, slots }) {
    const renderCaption = () => [
      <span class="roi-section-title">{props.title}</span>,
      props.count != null && <span class="roi-section-count">({props.count})</span>,
    ]

    return () => (
      <div
        class={['roi-section-header', { 'is-static': !props.collapsible }]}
        onClick={() => props.collapsible && emit('toggle')}
      >
        <span class="roi-section-label">
          {props.collapsible ? (
            // No click handler of its own: its click (mouse, Enter or Space) bubbles to the row
            <button type="button" class="button-reset roi-section-toggle" aria-expanded={!props.collapsed}>
              {renderCaption()}
            </button>
          ) : (
            <span class="roi-section-toggle">{renderCaption()}</span>
          )}
          {slots.default && (
            <span class="roi-section-extra" onClick={(e: MouseEvent) => e.stopPropagation()}>
              {slots.default()}
            </span>
          )}
        </span>
        {props.collapsible && (
          <ElIcon class="roi-section-chevron" size={12} data-collapsed={String(props.collapsed)}>
            {props.collapsed ? <ArrowRight /> : <ArrowDown />}
          </ElIcon>
        )}
      </div>
    )
  },
})
