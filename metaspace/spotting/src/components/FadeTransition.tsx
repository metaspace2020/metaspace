import { defineComponent } from '@vue/composition-api'

interface Props {}

export default defineComponent<Props>({
  name: 'FadeTransition',
  setup(_, { slots }) {
    return () => (
      <transition
        mode="out-in"
        enter-class="opacity-0"
        leave-to-class="opacity-0"
        enter-active-class="duration-150 transition-opacity ease-in-out"
        leave-active-class="duration-150 transition-opacity ease-in-out"
      >
        {slots.default && slots.default()}
      </transition>
    )
  },
})
