import { createComponent, reactive } from '@vue/composition-api'

import { PrimaryLabelText, SecondaryLabelText } from '../../components/Form'
import FadeTransition from '../../components/FadeTransition'
import { RichTextArea } from '../../components/RichText'

import { MolecularDB } from '../../api/moldb'

interface State {
  model: MolecularDB,
  loading: boolean,
}

interface Props {
  submit: (details: any) => void
  id: number,
  initialData: MolecularDB,
}

const Details = createComponent({
  props: {
    submit: { type: Function, required: true },
    id: { tyoe: Number, required: true },
    initialData: { type: Object, required: true },
  },
  setup(props, { root }) {
    const state = reactive<State>({
      model: {
        ...props.initialData,
      },
      loading: false,
    })

    const handleFormSubmit = async(e: Event) => {
      e.preventDefault()
      try {
        state.loading = true
        await props.submit({ id: props.id, details: state.model })
        root.$message({ message: 'Database details updated', type: 'success' })
      } catch (e) {
        console.log(e)
      } finally {
        state.loading = false
      }
    }

    return () => (
      <form class="sm-form v-rhythm-6" action="#" onSubmit={handleFormSubmit}>
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
            v-model={state.model.isPublic}
            class="mr-6"
          />
          <FadeTransition class="duration-200 cursor-pointer">
            {state.model.isPublic
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
