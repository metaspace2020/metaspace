import { defineComponent, reactive } from '@vue/composition-api'
import './GroupsListPage.scss'

interface GroupListPageProps {
  className: string
}

interface GroupListPageState {
  dataRange: any
}

export default defineComponent<GroupListPageProps>({
  name: 'GroupsListPage',
  props: {
    className: {
      type: String,
      default: 'groups-list',
    },
  },
  setup: function(props, ctx) {
    const { $route, $store } = ctx.root
    const state = reactive<GroupListPageState>({
      dataRange: { maxX: 0, maxY: 0, minX: 0, minY: 0 },
    })

    return () => {
      return (
        <div class={'groups-list-container'}>
          hey
        </div>
      )
    }
  },
})
