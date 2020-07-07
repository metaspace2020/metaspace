import { createComponent, reactive } from '@vue/composition-api'
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
  deleteDatabaseMutation,
  MolecularDB,
  updateDatabaseDetailsMutation,
  UpdateDatabaseDetailsMutation,
} from '../../api/moldb'

const getDetails = (database: MolecularDB) => {
  const {
    citation,
    description,
    fullName,
    isPublic,
    link,
  } = database

  return {
    citation,
    description,
    fullName,
    isPublic,
    link,
  }
}

const Details = createComponent({
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

    onResult(({ error }) => {
      if (error) {
        const { message = 'Sorry, something went wrong' } = error.graphQLErrors[0] || {}
        props.close()
        root.$message(message)
      }
    })

    const state = reactive({
      showNewVersionDialog: false,
    })

    const {
      mutate: updateDatabase,
    } = useMutation<UpdateDatabaseDetailsMutation>(updateDatabaseDetailsMutation)

    const submitAndRefetch = async(details: MolecularDB) => {
      await updateDatabase({
        id: props.id,
        details,
      })
      await refetch()
    }

    const {
      mutate: deleteDatabase,
    } = useMutation(deleteDatabaseMutation)

    const submitDeletion = async() => {
      await deleteDatabase({ id: props.id })
      root.$message({ message: 'Database has been deleted', type: 'success' })
      props.close()
    }

    return () => {
      let content

      if (result.value === undefined) {
        content = (
          <div class="h-16" v-loading />
        )
      } else {
        const { database } = result.value
        const details = getDetails(database)
        content = (
          <div class="relative leading-6 h2-leading-12">
            <div class="absolute top-0 left-0 h-12 flex items-center">
              <a
                class="font-medium text-gray-800 hover:text-primary button-reset text-sm no-underline"
                onClick={props.close}
                href="#"
              >
                <span class="flex items-center -mt-1">
                  <ArrowIcon class="sm-mini-icon mr-1" />
                  <span class="leading-none mt-1">All databases</span>
                </span>
              </a>
            </div>
            { state.showNewVersionDialog
              && <UploadDialog
                name={database.name}
                details={details}
                groupId={database?.group?.id}
                onClose={() => { state.showNewVersionDialog = false }}
              /> }
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
                id={props.id}
                initialData={details}
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
                  submit={submitDeletion}
                /> }
            </div>
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
