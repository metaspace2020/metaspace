import { createComponent, reactive, watch } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'

import { PrimaryLabelText } from '../../components/Form'
import FadeTransition from '../../components/FadeTransition'
import { RichTextArea } from '../../components/RichText'

import { databaseDetailsQuery, DatabaseDetailsQuery, MolecularDB } from '../../api/moldb'

interface State {
  status: 'WAITING' | 'FETCHED' | 'FETCH_ERROR' | 'SUBMIT_ERROR',
  model: MolecularDB | null
}

const Details = createComponent({
  props: {
    id: { type: Number, required: true },
  },
  setup(props) {
    const state = reactive<State>({
      status: 'WAITING',
      model: null,
    })

    const { result, loading } = useQuery<DatabaseDetailsQuery>(
      databaseDetailsQuery,
      { id: props.id },
    )

    watch(loading, isLoading => {
      if (isLoading) {
        state.status = 'WAITING'
      }
    })

    watch(result, value => {
      console.log(state.status, value)
      if (value) {
        state.model = value.database
        state.status = 'FETCHED'
      }
    })

    return () => {
      let content

      if (state.status === 'WAITING') {
        content = (
          <div class="h-16" v-loading />
        )
      }

      if (state.status === 'FETCHED' && state.model !== null) {
        content = (
          <div>
            <h2>Database details</h2>
            <form class="sm-form v-rhythm-6">
              <div class="w-1/2">
                <label for="database-name">
                  <PrimaryLabelText>Name</PrimaryLabelText>
                </label>
                <el-input
                  id="database-name"
                  v-model={state.model.name}
                />
              </div>
              <div class="flex items-end">
                <div class="w-1/4">
                  <label for="database-version">
                    <PrimaryLabelText>Version</PrimaryLabelText>
                  </label>
                  <el-input
                    id="database-version"
                    v-model={state.model.version}
                  />
                </div>
                <el-button class="ml-3 mb-1">
                  Upload new version
                </el-button>
              </div>
              <div>
                <label for="database-full-name">
                  <PrimaryLabelText>Full name</PrimaryLabelText>
                </label>
                <el-input
                  id="database-full-name"
                  v-model={state.model.fullName}
                />
              </div>
              <RichTextArea
                content={state.model.description}
                onUpdate={(content: string) => {
                  if (state.model) {
                    state.model.description = content
                  }
                }}
              >
                <PrimaryLabelText slot="label">Description</PrimaryLabelText>
              </RichTextArea>
              <div>
                <label for="database-link">
                  <PrimaryLabelText>Link</PrimaryLabelText>
                </label>
                <el-input id="database-link" v-model={state.model.link}/>
              </div>
              <RichTextArea
                content={state.model.citation}
                onUpdate={(content: string) => {
                  if (state.model) {
                    state.model.citation = content
                  }
                }}
              >
                <PrimaryLabelText slot="label">Citation</PrimaryLabelText>
              </RichTextArea>
              <el-button
                type="primary"
              >
                Update details
              </el-button>
            </form>
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
        )
      }

      return (
        <FadeTransition class="max-w-measure-3 mt-6 mx-auto mb-12 leading-6 h2-leading-12">
          {content}
        </FadeTransition>
      )
    }
  },
})

export default Details
