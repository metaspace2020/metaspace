import { createComponent, reactive, watch } from '@vue/composition-api'
import { useQuery, useMutation } from '@vue/apollo-composable'

import { PrimaryLabelText } from '../../components/Form'
import FadeTransition from '../../components/FadeTransition'
import { RichTextArea } from '../../components/RichText'

import {
  databaseDetailsQuery,
  DatabaseDetailsQuery,
  MolecularDB,
  updateDatabaseDetailsMutation,
  UpdateDatabaseDetailsMutation,
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
  setup(props) {
    const state = reactive<State>({
      model: undefined,
      name: undefined,
      version: undefined,
    })

    const { result } = useQuery<DatabaseDetailsQuery>(
      databaseDetailsQuery,
      { id: props.id },
      { fetchPolicy: 'no-cache' },
    )

    watch(result, value => {
      if (value) {
        const {
          citation,
          description,
          fullName,
          link,
          name,
          version,
        } = value.database

        state.name = name
        state.version = version
        state.model = {
          fullName,
          description,
          link,
          citation,
          public: false,
        }
      }
    })

    const {
      mutate: updateDetails,
    } = useMutation<UpdateDatabaseDetailsMutation>(updateDatabaseDetailsMutation)

    const handleFormSubmit = async(e: Event) => {
      e.preventDefault()
      try {
        await updateDetails({ id: props.id, details: state.model })
      } catch (e) {
        console.log(e)
      }
    }

    return () => {
      let content

      if (state.model === undefined) {
        content = (
          <div class="h-16" v-loading />
        )
      } else {
        content = (
          <div>
            <div class="flex justify-between items-center">
              <h2 title={`${state.name} - ${state.version}`} class="truncate">
                {state.name}{' '}
                <small class="text-gray-700 font-normal">{state.version}</small>
              </h2>
              <el-button class="ml-3">
                Upload new version
              </el-button>
            </div>
            <form class="sm-form v-rhythm-6 mt-3" action="#" onSubmit={handleFormSubmit}>
              {/* <div class="w-1/2">
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
              </div> */}
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
              <button class="el-button el-button--primary">
                Update details
              </button>
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
