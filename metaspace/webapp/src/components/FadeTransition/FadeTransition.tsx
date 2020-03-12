import { createComponent } from '@vue/composition-api'

export default createComponent({
  setup(_, { slots }) {
    return () => (
      <transition name="sm-fade" mode="out-in">
        {slots.default()}
      </transition>
    )
  },
})
