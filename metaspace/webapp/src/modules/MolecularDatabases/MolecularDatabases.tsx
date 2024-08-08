import { defineComponent, watch, reactive, computed, onMounted } from 'vue'
import FadeTransition from '../../components/FadeTransition'

import Table from './DatabasesTable'
import DetailsView from './DatabaseDetailsView'
import { useRoute, useRouter } from 'vue-router'

interface State {
  selectedDatabase: number | null
  showUploadDialog: boolean
}

export default defineComponent({
  name: 'MolecularDatabases',
  props: {
    canDelete: { type: Boolean, default: false },
    groupId: { type: String, required: true },
  },
  setup(props) {
    const route = useRoute()
    const router = useRouter()
    const state = reactive<State>({
      selectedDatabase: null,
      showUploadDialog: false,
    })
    const dbQuery = computed(() => route.query.db)
    const setView = (db) => {
      state.selectedDatabase = parseInt(db, 10) || null
    }

    watch(dbQuery, (db: any) => {
      setView(db)
    })

    onMounted(() => {
      if (!dbQuery.value) return
      setView(dbQuery.value)
    })

    const selectDatabase = (row: any) => {
      router.push({ query: { ...router.currentRoute.value.query, db: row.id } })
    }

    const removeSelected = () => {
      const { ...query } = router.currentRoute.value.query
      if (query) {
        delete query.db
      }
      router.push({ query })
    }

    return () => (
      <FadeTransition>
        {state.selectedDatabase !== null ? (
          <DetailsView id={state.selectedDatabase} canDelete={props.canDelete} close={removeSelected} />
        ) : (
          <Table groupId={props.groupId} handleRowClick={selectDatabase} />
        )}
      </FadeTransition>
    )
  },
})
