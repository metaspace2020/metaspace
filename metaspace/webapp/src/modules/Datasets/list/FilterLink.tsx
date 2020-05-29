import { createComponent } from '@vue/composition-api'
import { encodeParams } from '../../Filters'

const FilterLink = createComponent({
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
