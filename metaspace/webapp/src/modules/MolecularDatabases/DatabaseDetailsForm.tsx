import { defineComponent, reactive } from '@vue/composition-api'

import { SmForm, PrimaryLabelText, SecondaryLabelText, RadioButton } from '../../components/Form'
import { RichTextArea } from '../../components/RichText'

import { MolecularDB, MolecularDBDetails, UpdateDatabaseDetailsMutation } from '../../api/moldb'
import { formatDatabaseLabel, getDatabaseDetails } from './formatting'

interface State {
  model: MolecularDBDetails,
  loading: boolean,
}

interface Props {
  db: MolecularDB,
  submit: (update: UpdateDatabaseDetailsMutation) => void
}

const Details = defineComponent<Props>({
  name: 'DatabaseDetailsForm',
  props: {
    db: { type: Object, required: true },
    submit: { type: Function, required: true },
  },
  setup(props, { root }) {
    const state = reactive<State>({
      model: getDatabaseDetails(props.db),
      loading: false,
    })

    const handleFormSubmit = async() => {
      try {
        state.loading = true
        await props.submit({ id: props.db.id, details: state.model })
        root.$message({ message: `${formatDatabaseLabel(props.db)} updated`, type: 'success' })
      } catch (e) {
        root.$message({ message: 'Something went wrong, please try again later', type: 'error' })
      } finally {
        state.loading = false
      }
    }

    return () => (
      <SmForm class="v-rhythm-6" onSubmit={handleFormSubmit}>
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
          <p class="m-0 mb-3">
            <PrimaryLabelText>Annotation access</PrimaryLabelText>
          </p>
          <RadioButton
            id="database-annotations-private"
            name="isPublic"
            checked={!state.model.isPublic}
            onChange={() => { state.model.isPublic = false }}
          >
            <PrimaryLabelText>Annotations are private</PrimaryLabelText>
            <SecondaryLabelText>Results will be visible to group members only</SecondaryLabelText>
          </RadioButton>
          <RadioButton
            id="database-annotations-public"
            name="isPublic"
            checked={state.model.isPublic}
            onChange={() => { state.model.isPublic = true }}
          >
            <PrimaryLabelText>Annotations are public</PrimaryLabelText>
            <SecondaryLabelText>Results will be visible to everyone</SecondaryLabelText>
          </RadioButton>
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
      </SmForm>
    )
  },
})

export default Details
