import { createComponent, watch, reactive } from '@vue/composition-api'

import router from '../../router'
import FadeTransition from '../../components/FadeTransition'

import Table from './DatabasesTable'
import Details from './DatabaseDetails'

export default createComponent({
  props: {
    databases: Array,
  },
  setup(props, { root }) {
    const state = reactive({
      selectedDatabase: '',
    })

    watch(
      () => root.$route.query.db,
      db => { state.selectedDatabase = db },
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
        {state.selectedDatabase
          ? <div class="relative">
            <el-button class="absolute top-0 left-0" onClick={removeSelected}>
              Go back
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
