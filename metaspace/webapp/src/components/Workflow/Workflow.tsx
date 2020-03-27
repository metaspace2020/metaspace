import { createComponent } from '@vue/composition-api'

/* prevents ts errors for attributes */
interface Props {
  children: []
}

export const Workflow = createComponent<Props>({
  props: {
    children: [],
  },
  setup(_, { slots }) {
    return () => (
      <ol class="sm-workflow">
        {...slots.default()}
      </ol>
    )
  },
})

export const WorkflowItem = createComponent({
  props: {
    active: Boolean,
    done: Boolean,
  },
  setup(props, { slots }) {
    return () => (
      <li class={[
        'sm-workflow-item',
        'flex flex-col relative text-gray-600 max-w-measure-3 ml-8 pl-12',
        'border-solid border-0 border-l-2 border-gray-200',
        'transition-colors ease-in-out duration-300',
        { active: props.active, done: props.done },
      ]}>
        {slots.default()}
      </li>
    )
  },
})
