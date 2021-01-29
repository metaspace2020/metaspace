import { defineComponent, reactive } from '@vue/composition-api'
import { useQuery, useMutation } from '@vue/apollo-composable'

import FadeTransition from '../../components/FadeTransition'

import DetailsForm from './DatabaseDetailsForm'
import ArchiveForm from './ArchiveDatabaseForm'
import DeleteForm from './DeleteDatabaseForm'
import UploadDialog from './UploadDialog'

import '../../components/MiniIcon.css'
import ArrowIcon from '../../assets/inline/refactoring-ui/arrow-thin-left-circle.svg'

import {
  databaseDetailsQuery,
  DatabaseDetailsQuery,
  MolecularDB,
  updateDatabaseDetailsMutation,
  UpdateDatabaseDetailsMutation,
} from '../../api/moldb'
import { getDatabaseDetails } from './formatting'
import reportError from '../../lib/reportError'

interface Props {
  id: number
  canDelete: boolean
  close: () => void
}

const Details = defineComponent<Props>({
  name: 'DatabaseDetailsView',
  props: {
    id: { type: Number, required: true },
    canDelete: { type: Boolean, default: false },
    close: { type: Function, required: true },
  },
  setup(props, { root }) {
    const { result, refetch, onResult } = useQuery<DatabaseDetailsQuery>(
      databaseDetailsQuery,
      { id: props.id },
      { fetchPolicy: 'no-cache' },
    )

    onResult(result => {
      if (result && result.errors) {
        reportError(result.errors[0], 'Sorry, something went wrong')
        props.close()
      }
    })

    const state = reactive({
      showNewVersionDialog: false,
    })

    const handleNewVersionClose = () => { state.showNewVersionDialog = false }
    const handleNewVersionDone = () => {
      handleNewVersionClose()
      props.close()
    }

    const {
      mutate: updateDatabase,
    } = useMutation(updateDatabaseDetailsMutation)

    // hacking
    const submit = updateDatabase as unknown as (update: UpdateDatabaseDetailsMutation) => void

    const submitAndRefetch = async(details: MolecularDB) => {
      await submit({
        id: props.id,
        details,
      })
      await refetch()
    }

    return () => {
      let content

      if (result.value === undefined) {
        content = (
          <div class="h-16" v-loading />
        )
      } else {
        const database = {
          ...result.value.database,
          id: props.id,
        }
        content = (
          <div class="relative leading-6 h2-leading-12">
            <div class="absolute top-0 left-0 h-12 flex items-center">
              <a
                class="font-medium text-gray-800 hover:text-primary button-reset text-sm no-underline h-6"
                onClick={props.close}
                href="#"
              >
                <span class="flex items-center">
                  <ArrowIcon class="sm-mini-icon mr-1" />
                  <span class="leading-none mt-1">All databases</span>
                </span>
              </a>
            </div>
            <div class="max-w-measure-3 mx-auto mt-6 mb-18">
              <div class="flex justify-between items-center">
                <h2 title={`${database.name} - ${database.version}`} class="truncate">
                  {database.name}{' '}
                  <small class="text-gray-700 font-normal">{database.version}</small>
                </h2>
                <el-button class="ml-3" onClick={() => { state.showNewVersionDialog = true }}>
                  Upload new version
                </el-button>
              </div>
              <DetailsForm
                class="mt-3"
                db={database}
                submit={updateDatabase}
              />
              <ArchiveForm
                class="mt-12"
                archived={database.archived || false}
                submit={submitAndRefetch}
              />
              { props.canDelete
                && <DeleteForm
                  class="mt-12"
                  db={database}
                  onDeleted={props.close}
                /> }
            </div>
            { state.showNewVersionDialog
              && <UploadDialog
                name={database.name}
                details={getDatabaseDetails(database)}
                groupId={database.group.id}
                onClose={handleNewVersionClose}
                onDone={handleNewVersionDone}
              /> }
          </div>
        )
      }

      return (
        <FadeTransition>
          {content}
        </FadeTransition>
      )
    }
  },
})

export default Details
