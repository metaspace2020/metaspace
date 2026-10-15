import { defineComponent, PropType, ref } from 'vue'
import './SectionCard.scss'

export type SectionCardVariant = 'default' | 'legacy'

let cardSeq = 0

/**
 * Collapsible card used for every section of the metadata pages (Metadata, Data management,
 * Annotation settings). The header button toggles the body; `headerRight` holds counters/actions and
 * `afterTitle` holds badges shown next to the title. Exposes `expand()`.
 */
export const SectionCard = defineComponent({
  name: 'SectionCard',
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, default: undefined },
    variant: { type: String as PropType<SectionCardVariant>, default: 'default' },
    defaultCollapsed: { type: Boolean, default: false },
  },
  setup(props, { slots, expose }) {
    const collapsed = ref(props.defaultCollapsed)
    const bodyId = `section-card-${++cardSeq}`
    /** Opens the body (e.g. before focusing a field inside it). */
    const expand = (): void => {
      collapsed.value = false
    }
    expose({ expand })
    return () => (
      <section class={['section-card', `section-card--${props.variant}`]}>
        <div class="section-card__header">
          <button
            type="button"
            class="section-card__toggle"
            aria-expanded={!collapsed.value}
            aria-controls={bodyId}
            onClick={() => (collapsed.value = !collapsed.value)}
          >
            <span class="section-card__caret" aria-hidden="true">
              {collapsed.value ? '▶' : '▼'}
            </span>
            <span class="section-card__title">{props.title}</span>
            {props.subtitle && <span class="section-card__subtitle">— {props.subtitle}</span>}
          </button>
          {slots.afterTitle?.()}
          {slots.headerRight && <div class="section-card__right">{slots.headerRight()}</div>}
        </div>
        {!collapsed.value && (
          <div id={bodyId} class="section-card__body">
            {slots.default?.()}
          </div>
        )}
      </section>
    )
  },
})

/** "N of M required" counter with an optional 90px progress bar, for card headers. */
export const RequiredCounter = defineComponent({
  name: 'RequiredCounter',
  props: {
    filled: { type: Number, required: true },
    total: { type: Number, required: true },
    bar: { type: Boolean, default: false },
  },
  setup(props) {
    return () => {
      const pct = props.total ? Math.round((props.filled / props.total) * 100) : 0
      return (
        <span class="section-card__counter inline-flex items-center gap-2">
          <span>
            {props.filled} of {props.total} required
          </span>
          {props.bar && (
            <span
              class={['section-card__progress', { 'is-complete': pct === 100 }]}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${props.filled} of ${props.total} required fields filled`}
            >
              <span style={{ width: `${pct}%` }} />
            </span>
          )}
        </span>
      )
    }
  },
})
