import { createComponent, watch, reactive } from '@vue/composition-api'

import router from '../../router'
import FadeTransition from '../../components/FadeTransition'

import Table from './DatabasesTable'
import Details from './DatabaseDetails'

import '../../components/MiniIcon.css'
import ArrowIcon from '../../assets/inline/refactoring-ui/arrow-thin-left-circle.svg'

interface State {
  selectedDatabase: number | null,
}

export default createComponent({
  props: {
    databases: Array,
  },
  setup(props, { root }) {
    const state = reactive<State>({
      selectedDatabase: null,
    })

    watch(
      () => root.$route.query.db,
      db => { state.selectedDatabase = parseInt(db, 10) || null },
    )

    const selectDatabase = (row: any) => {
      router.push({ query: { ...router.currentRoute.query, db: row.id } })
    }

    const removeSelected = () => {
      const { db, ...query } = router.currentRoute.query
      router.push({ query })
    }

    return () => (
      <FadeTransition>
        {state.selectedDatabase !== null
          ? <div class="relative">
            <el-button
              class="absolute top-0 left-0 p-0 -mt-1 text-gray-800"
              onClick={removeSelected}
              type="text"
            >
              <span class="flex items-center">
                <ArrowIcon class="sm-mini-icon mr-1" />
                <span class="leading-none mt-1">All databases</span>
              </span>
            </el-button>
            <Details
              id={state.selectedDatabase}
            />
          </div>
          : <Table
            databases={props.databases}
            handleRowClick={selectDatabase}
          /> }
      </FadeTransition>
    )
  },
})
