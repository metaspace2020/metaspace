import { createComponent, computed, reactive } from '@vue/composition-api'
import { Button, Input } from 'element-ui'

import { WorkflowStep } from '../../../components/Workflow'

import confirmPrompt from '../../../components/confirmPrompt'

const PublishData = createComponent({
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
      confirmPrompt({
        title: '',
        type: 'warning',
        style: 'danger',
        confirmButtonText: 'Publish',
        message: (
          <div>
            <p>
              <strong>Publishing a project is a one-time event.</strong>
            </p>
            <p>Please confirm your intention to make this project and its datasets available to all METASPACE users.</p>
            <p>
              <em>This cannot be undone.</em>
            </p>
          </div>
        ),
      }, () => props.publishProject(state.doi))
    }

    return () => (
      <WorkflowStep
        active={props.active}
        done={props.done}
      >
        <h2 class="sm-workflow-header">Publish the data</h2>
        {!props.active && !props.done
        && <p>This project and its datasets will be made public.</p>}
        {props.active
          && <form onSubmit={(e: Event) => { e.preventDefault() }}>
            <p class="italic">
              Complete this step after the DOI for your paper has been issued.
              <br />
              You will receive a reminder by email.
            </p>
            <div>
              <label for="scientific-publishing-doi">
                <span class="font-medium">Publication DOI</span>
                <span class="text-sm block">Should link to the published paper</span>
              </label>
              <Input
                v-model={state.doi}
                id="scientific-publishing-doi"
                class="py-1"
              >
                <span slot="prepend">https://doi.org/</span>
                <a
                  slot="append"
                  href={`https://doi.org/${state.doi}`}
                  target="_blank"
                  rel="noopener"
                  class="text-gray-600"
                >
                  Test link
                </a>
              </Input>
            </div>
            <Button type="primary" onClick={submit}>
              Publish project
            </Button>
          </form>
        }
        {props.done && <p>The project and its datasets are now public, thank you for your contribution.</p>}
      </WorkflowStep>
    )
  },
})

export default PublishData
