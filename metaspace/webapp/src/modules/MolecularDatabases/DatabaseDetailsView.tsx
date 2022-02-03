import { computed, defineComponent, reactive } from '@vue/composition-api'
import { useQuery, useMutation } from '@vue/apollo-composable'
import FadeTransition from '../../components/FadeTransition'
import DetailsForm from './DatabaseDetailsForm'
import ArchiveForm from './ArchiveDatabaseForm'
import DeleteForm from './DeleteDatabaseForm'
import UploadDialog from './UploadDialog'
import SecondaryIcon from '../../components/SecondaryIcon.vue'
import ArrowSvg from '../../assets/inline/refactoring-ui/icon-arrow-thin-left-circle.svg'
import {
  databaseDetailsQuery,
  DatabaseDetailsQuery,
  MolecularDB,
  updateDatabaseDetailsMutation,
  UpdateDatabaseDetailsMutation,
} from '../../api/moldb'
import { getDatabaseDetails } from './formatting'
import reportError from '../../lib/reportError'
import safeJsonParse from '../../lib/safeJsonParse'
import './DatabaseDetails.scss'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'

interface DownloadJson{
  filename: string,
  link: string
}

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
    const {
      result: currentUserResult,
      loading: userLoading,
    } = useQuery<CurrentUserRoleResult|any>(currentUserRoleQuery)
    const currentUser = computed(() => currentUserResult.value != null ? currentUserResult.value.currentUser : null)

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

    const downloadLink = computed<DownloadJson>(() => {
      try {
        const { database } = result.value
        return safeJsonParse(database.downloadLink)
      } catch (e) {
        return null
      }
    })

    const canDelete = () => {
      try {
        const { database } = result.value
        const { user } = database
        return props.canDelete || (currentUser.value.id === user!.id)
      } catch (e) {
        return props.canDelete
      }
    }

    const renderDownload = () => {
      if (!downloadLink.value) {
        return null
      }
      const { filename, link } = downloadLink.value
      return (
        <div class="margin-reset mt-12 mt-12">
          <h2>Download database</h2>
          <p>Download the original database TSV file: <i>{decodeURI(filename)}</i>.</p>
          <a href={link} download={filename} class="el-button el-button--primary no-underline mt-5">
            <span>
              Download database
            </span>
          </a>
        </div>)
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
          <div class="relative leading-6 h2-leading-12 database-details-container">
            <div class="absolute top-0 left-0 h-12 flex items-center">
              <a
                class="font-medium text-gray-800 hover:text-primary button-reset text-sm no-underline h-6"
                onClick={props.close}
                href="#"
              >
                <span class="flex items-center">
                  <SecondaryIcon class="mr-1">
                    <ArrowSvg />
                  </SecondaryIcon>
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
              {renderDownload()}
              {canDelete()
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
