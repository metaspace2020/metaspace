import { createComponent, reactive } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'

import FadeTransition from '../../components/FadeTransition'

import DetailsForm from './DatabaseDetailsForm'
import UploadDialog from './UploadDialog'

import {
  databaseDetailsQuery,
  DatabaseDetailsQuery,
  MolecularDB,
} from '../../api/moldb'

const getDetails = (database: MolecularDB) => {
  const {
    citation,
    description,
    fullName,
    link,
  } = database

  return {
    citation,
    description,
    fullName,
    link,
  }
}

const Details = createComponent({
  props: {
    id: { type: Number, required: true },
  },
  setup(props, { slots }) {
    const { result } = useQuery<DatabaseDetailsQuery>(
      databaseDetailsQuery,
      { id: props.id },
      { fetchPolicy: 'no-cache' },
    )

    const state = reactive({
      showNewVersionDialog: false,
    })

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
            {slots.back()}
            { state.showNewVersionDialog
              && <UploadDialog
                name={database.name}
                details={details}
                // groupId={database.group.id} -- future API
                onClose={() => { state.showNewVersionDialog = false }}
              /> }
            <div class="max-w-measure-3 mx-auto mt-6 mb-12">
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
                initialData={details}
              />
              <section class="margin-reset mt-12">
                <h2>Archive database</h2>
                <p>Database will not be available for processing new datasets.</p>
                <el-button class="mt-5">
                  Archive database
                </el-button>
              </section>
              <section class="margin-reset mt-12">
                <h2>Delete database</h2>
                <p>Unprocessed dataset jobs using this database will also be removed.</p>
                <el-button type="danger" class="mt-5">
                  Delete database
                </el-button>
              </section>
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
