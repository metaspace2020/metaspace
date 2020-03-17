import { createComponent } from '@vue/composition-api'

export default createComponent({
  setup(_, { slots }) {
    return () => (
      <transition
        mode="out-in"
        enter-class="opacity-0"
        leave-to-class="opacity-0"
        enter-active-class="duration-150 transition-opacity ease-in-out"
        leave-active-class="duration-150 transition-opacity ease-in-out"
      >
        {slots.default()}
      </transition>
    )
  },
})
