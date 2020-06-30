import { createComponent, watch, reactive } from '@vue/composition-api'

import router from '../../router'
import FadeTransition from '../../components/FadeTransition'

import Table from './DatabasesTable'
import DetailsView from './DatabaseDetailsView'

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
          ? <DetailsView id={state.selectedDatabase}>
            <div slot="back" class="absolute top-0 left-0 h-12 flex items-center">
              <a
                class="font-medium text-gray-800 hover:text-primary button-reset text-sm no-underline"
                onClick={removeSelected}
                href="#"
              >
                <span class="flex items-center -mt-1">
                  <ArrowIcon class="sm-mini-icon mr-1" />
                  <span class="leading-none mt-1">All databases</span>
                </span>
              </a>
            </div>
          </DetailsView>
          : <Table
            databases={props.databases}
            handleRowClick={selectDatabase}
          /> }
      </FadeTransition>
    )
  },
})
