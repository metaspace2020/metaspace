import { defineComponent } from 'vue'
import { encodeParams } from '../../Filters'
import { useStore } from 'vuex'

interface Props {
  path?: string
  filter: any
}

const FilterLink = defineComponent({
  name: 'FilterLink',
  props: {
    path: { type: String, default: '/annotations' },
    filter: { type: Object, required: true },
  },
  setup(props: Props | any, { slots }) {
    const store = useStore()
    return () => {
      const filter = {
        ...store.getters.filter,
        ...props.filter,
      }
      const to = {
        path: props.path,
        query: encodeParams(filter, props.path, store.state.filterLists),
      }
      return <router-link to={to}>{slots.default?.()}</router-link>
    }
  },
})

export default FilterLink
