import { defineComponent } from '@vue/composition-api'
import { encodeParams } from '../../Filters'

interface Props {
  path?: string
  filter: any
}

const FilterLink = defineComponent<Props>({
  name: 'FilterLink',
  props: {
    path: { type: String, default: '/annotations' },
    filter: { type: Object, required: true },
  },
  setup(props, { slots, root }) {
    return () => {
      const filter = {
        ...root.$store.getters.filter,
        ...props.filter,
      }
      const to = {
        path: props.path,
        query: encodeParams(filter, props.path, root.$store.state.filterLists),
      }
      return (
        <router-link to={to}>
          {slots.default?.()}
        </router-link>
      )
    }
  },
})

export default FilterLink
