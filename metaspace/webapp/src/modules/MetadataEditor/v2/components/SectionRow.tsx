import { defineComponent } from 'vue'
import './SectionCard.scss'

/**
 * One labelled row inside a SectionCard body: a 164px label column (title + optional help) and a
 * flexible body. Consecutive rows are separated by a rule. The `title` slot overrides the title text
 * (e.g. to add a help popover).
 */
export const SectionRow = defineComponent({
  name: 'SectionRow',
  props: {
    title: { type: String, required: true },
    help: { type: String, default: undefined },
  },
  setup(props, { slots }) {
    return () => (
      <div class="section-row">
        <div class="section-row__label">
          <div class="section-row__title">{slots.title ? slots.title() : props.title}</div>
          {props.help && <div class="section-row__help">{props.help}</div>}
        </div>
        <div class="section-row__body">{slots.default?.()}</div>
      </div>
    )
  },
})
