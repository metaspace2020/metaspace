import { createComponent, reactive } from '@vue/composition-api'
import { useMutation } from '@vue/apollo-composable'

import { PrimaryLabelText, SecondaryLabelText } from '../../components/Form'
import FadeTransition from '../../components/FadeTransition'
import { RichTextArea } from '../../components/RichText'

import {
  MolecularDB,
  updateDatabaseDetailsMutation,
  UpdateDatabaseDetailsMutation,
} from '../../api/moldb'

interface State {
  model: MolecularDB
}

const Details = createComponent({
  props: {
    initialData: { type: Object, required: true },
  },
  setup(props) {
    const state = reactive<State>({
      model: {
        ...props.initialData,
        public: false,
      },
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

    return () => (
      <form class="sm-form v-rhythm-6" action="#" onSubmit={handleFormSubmit}>
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
        <div class="flex items-center">
          <el-switch
            id="database-public"
            v-model={state.model.public}
            class="mr-6"
          />
          <FadeTransition class="duration-200 cursor-pointer">
            {state.model.public
              ? <label key="public" for="database-public">
                <PrimaryLabelText>Annotations are public</PrimaryLabelText>
                <SecondaryLabelText>Results will be visible to everyone</SecondaryLabelText>
              </label>
              : <label key="private" for="database-public">
                <PrimaryLabelText>Annotations are private</PrimaryLabelText>
                <SecondaryLabelText>Results will be visible to group members only</SecondaryLabelText>
              </label> }
          </FadeTransition>
        </div>
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
    )
  },
})

export default Details
