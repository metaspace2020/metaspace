import { defineComponent } from 'vue'

/* checked and purging looks ok */
const classes = `
  mx-1 px-3 py-2 rounded-md no-underline
  text-sm font-medium text-white lg:tracking-wide
  focus:outline-none
  transition-colors duration-150 ease-in-out
  border border-solid border-transparent
`

export const activeClass = 'header-link-active'

export const HeaderLink = defineComponent({
  props: {
    to: { type: [String, Object] },
    isActive: Boolean,
    id: String,
  },
  setup(props, { slots }) {
    return () => (
      <router-link
        id={props.id}
        to={props.to}
        class={[classes, props.isActive && activeClass]}
        activeClass={activeClass}
      >
        {slots.default()}
      </router-link>
    )
  },
})

export default HeaderLink

export const HeaderButton = defineComponent({
  props: {
    onClick: Function,
  },
  setup(props, { slots }) {
    return () => (
      <button
        class={`button-reset ${classes}`} // @ts-ignore
        onClick={props.onClick}
      >
        {slots.default()}
      </button>
    )
  },
})
