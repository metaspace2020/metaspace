import { defineComponent, reactive } from 'vue'
import { ElButton } from '../../../lib/element-plus'

import { WorkflowStep } from '../../../components/Workflow'
import { SmForm } from '../../../components/Form'
import DoiField from '../DoiField'

import confirmPrompt from '../../../components/confirmPrompt'

const PublishData = defineComponent({
  props: {
    active: Boolean,
    done: Boolean,
    publishProject: { type: Function, required: true },
  },
  setup(props) {
    const state = reactive({
      doi: '',
    })

    const submit = () => {
      confirmPrompt(
        {
          title: '',
          type: 'warning',
          style: 'danger',
          confirmButtonText: 'Publish',
          message: (
            <div>
              <p>
                <strong>Publishing a project is a one-time event.</strong>
              </p>
              <p>
                Please confirm your intention to make this project and its datasets available to all METASPACE users.
              </p>
              <p>
                <em>This cannot be undone.</em>
              </p>
            </div>
          ),
        },
        () => props.publishProject(state.doi)
      )
    }

    return () => (
      <WorkflowStep active={props.active} done={props.done}>
        <h2 class="sm-workflow-header">Publish the data</h2>
        {!props.active && !props.done && <p>This project and its datasets will be made public.</p>}
        {props.active && (
          <SmForm>
            <p class="italic">
              Complete this step after the DOI for your paper has been issued.
              <br />
              You will receive a reminder by email.
            </p>
            <DoiField v-model={state.doi} id="scientific-publishing-doi" />
            <ElButton type="primary" onClick={submit}>
              Publish project
            </ElButton>
          </SmForm>
        )}
      </WorkflowStep>
    )
  },
})

export default PublishData
