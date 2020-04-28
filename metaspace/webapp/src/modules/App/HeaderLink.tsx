import { createComponent } from '@vue/composition-api'

interface Props {
  to: string
}

export default createComponent<Props>({
  props: {
    to: String,
  },
  setup(props, { slots }) {
    return () => (
      <router-link
        to={props.to}
        class={`
          mx-1 lg:mx-2 px-3 py-2 rounded-md no-underline
          text-sm lg:text-base font-medium text-white
          hover:bg-blue-700 focus:outline-none focus:bg-blue-700
          transition-colors duration-150 ease-in-out
          border border-solid border-transparent
        `}
        activeClass="bg-blue-700"
      >
        {slots.default()}
      </router-link>
    )
  },
})
