import { createComponent } from '@vue/composition-api'

export default createComponent({
  props: {
    mode: String,
  },
  setup(props, { slots }) {
    return () => (
      <transition name="sm-fade" mode={props.mode}>
        {slots.default()}
      </transition>
    )
  },
})
