import { defineComponent } from '@vue/composition-api'

/* prevents ts errors for attributes */
interface Props {
  children: []
}

export const Workflow = defineComponent<Props>({
  props: {
    children: [],
  },
  setup(_, { slots }) {
    return () => (
      <ol class="sm-workflow leading-6 m-0 p-0">
        {...slots.default()}
      </ol>
    )
  },
})

export const WorkflowStep = defineComponent({
  props: {
    active: Boolean,
    done: Boolean,
  },
  setup(props, { slots }) {
    return () => (
      <li class={[
        'sm-workflow-step',
        'flex flex-col relative text-gray-600 max-w-measure-3 ml-8 pl-12',
        'border-solid border-0 border-l-2 border-gray-300',
        'transition-colors ease-in-out duration-300',
        { active: props.active, 'done border-blue-200': props.done },
      ]}>
        {slots.default()}
      </li>
    )
  },
})
