import { createComponent, watch, reactive } from '@vue/composition-api'

import router from '../../router'
import FadeTransition from '../../components/FadeTransition'

import Table from './DatabasesTable'
import DetailsView from './DatabaseDetailsView'

interface State {
  selectedDatabase: number | null,
  showUploadDialog: boolean,
}

export default createComponent({
  props: {
    canDelete: { type: Boolean, default: false },
    groupId: { type: String, required: true },
  },
  setup(props, { root }) {
    const state = reactive<State>({
      selectedDatabase: null,
      showUploadDialog: false,
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
        { state.selectedDatabase !== null
          ? <DetailsView
            id={state.selectedDatabase}
            canDelete={props.canDelete}
            close={removeSelected}
          />
          : <Table
            groupId={props.groupId}
            handleRowClick={selectDatabase}
          /> }
      </FadeTransition>
    )
  },
})
