import { defineComponent, reactive, computed } from '@vue/composition-api'
import { Button } from '../../../lib/element-ui'

import { WorkflowStep } from '../../../components/Workflow'
import confirmPrompt from '../../../components/confirmPrompt'
import CopyToClipboard from '../../../components/Form/CopyToClipboard'

interface Props {
  active: boolean
  createLink: Function
  deleteLink: Function
  done: boolean
  projectId: string | undefined
  reviewToken: string | undefined
}

interface State {
  loading: boolean
}

const CreateReviewLink = defineComponent<Props>({
  props: {
    active: Boolean,
    createLink: Function,
    deleteLink: Function,
    done: Boolean,
    projectId: String,
    reviewToken: String,
  },
  setup(props) {
    const reviewLink = computed(() => {
      if (!props.projectId || !props.reviewToken) {
        return undefined
      }
      return `${window.location.origin}/api_auth/review?prj=${props.projectId}&token=${props.reviewToken}`
    })

    const state = reactive<State>({
      loading: false,
    })

    const submit = async() => {
      if (props.createLink) {
        state.loading = true
        try {
          await props.createLink()
        } finally {
          state.loading = false
        }
      }
    }

    const undo = () => {
      confirmPrompt({
        title: '',
        type: 'warning',
        style: 'warning',
        confirmButtonText: 'Confirm',
        message: (
          <p>
            <strong>This will remove access to the project.</strong>
            <br />
            You will need to create a new link and send it to reviewers to grant access again.
          </p>
        ),
      }, props.deleteLink)
    }

    return () => (
      <WorkflowStep
        active={props.active}
        done={props.done}
      >
        <h2 class="sm-workflow-header">Create link for reviewers</h2>
        {!props.done
          && <p>
            A review link allows reviewers to access this project and its datasets
            without making the project available to everyone.
          </p>}
        {props.active
          && <form onSubmit={(e: Event) => e.preventDefault()}>
            <p class="italic">Creating a review link will prevent certain actions:</p>
            <ul class="italic p-0 list-disc">
              <li>
                the project cannot be deleted
              </li>
              <li>
                datasets cannot be removed from the project
              </li>
              <li>
                datasets in the project cannot be deleted
              </li>
            </ul>
            <p class="italic">These actions can be restored by removing the link.</p>
            <Button
              onClick={submit}
              loading={state.loading}
              type="primary"
            >
              Create link
            </Button>
          </form>
        }
        {props.done
          && <form>
            <p class="pb-3"><em>Review links are temporary and will not work after the project is published.</em></p>
            <label>
              <span class="font-medium text-primary">Reviewers can access the project using this link:</span>
              <CopyToClipboard value={reviewLink.value} class="py-1" />
            </label>
            <Button
              onClick={undo}
            >
              Remove link
            </Button>
          </form>
        }
      </WorkflowStep>
    )
  },
})

export default CreateReviewLink
