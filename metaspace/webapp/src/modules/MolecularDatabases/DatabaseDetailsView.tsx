import { createComponent } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'

import FadeTransition from '../../components/FadeTransition'

import DetailsForm from './DatabaseDetailsForm'

import {
  databaseDetailsQuery,
  DatabaseDetailsQuery,
  MolecularDB,
} from '../../api/moldb'

interface State {
  model: MolecularDB | undefined
  name: string | undefined
  version: string | undefined
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

    return () => {
      let content

      if (result.value === undefined) {
        content = (
          <div class="h-16" v-loading />
        )
      } else {
        const { database } = result.value
        content = (
          <div class="relative leading-6 h2-leading-12">
            {slots.back()}
            <div class="max-w-measure-3 mx-auto mt-6 mb-12">
              <div class="flex justify-between items-center">
                <h2 title={`${database.name} - ${database.version}`} class="truncate">
                  {database.name}{' '}
                  <small class="text-gray-700 font-normal">{database.version}</small>
                </h2>
                <el-button class="ml-3">
                  Upload new version
                </el-button>
              </div>
              <DetailsForm
                class="mt-3"
                database={result.value.database}
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
