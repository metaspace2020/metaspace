import './Review.css'

import { createComponent, computed, reactive } from '@vue/composition-api'
import { Button, Input } from 'element-ui'

import { WorkflowStep } from '../../components/Workflow'
import CopyToClipboard from '../../components/CopyToClipboard'

import confirmPrompt from '../../components/confirmPrompt'

const ReviewStepTwo = createComponent({
  props: {
    active: Boolean,
    done: Boolean,
    projectId: String,
    reviewToken: String,
    publishProject: { type: Function, required: true },
  },
  setup(props) {
    const reviewLink = computed(() => {
      if (!props.projectId || !props.reviewToken) {
        return undefined
      }
      return `${window.location.origin}/api_auth/review?prj=${props.projectId}&token=${props.reviewToken}`
    })

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
        <h2 class="sm-workflow-header">Review in progress</h2>
        {props.active
          ? <form onSubmit={(e: Event) => { e.preventDefault() }}>
            <p>Reviewers can access this project using the following link:</p>
            <CopyToClipboard value={reviewLink.value} />
            <p>
              Once review is complete, we encourage making data publicly available.
            </p>
            <p>
              <em>You will receive a reminder to complete this step by email.</em>
            </p>
            <div>
              <label for="project-review-doi">Link the project to the publication with a DOI:</label>
              <Input
                v-model={state.doi}
                id="project-review-doi"
                class="mb-2"
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
          : <p>Reviewers will have access to this project prior to publication.</p>
        }
      </WorkflowStep>
    )
  },
})

export default ReviewStepTwo
