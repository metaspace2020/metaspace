import { createComponent, reactive, computed } from '@vue/composition-api'
import { Button } from 'element-ui'

import { WorkflowStep } from '../../../components/Workflow'
import confirmPrompt from '../../../components/confirmPrompt'
import CopyToClipboard from '../../../components/CopyToClipboard'

interface Props {
  active: boolean
  canUndo: boolean
  createLink: Function
  deleteLink: Function
  done: boolean
  projectId: string | undefined
  reviewToken: string | undefined
}

interface State {
  loading: boolean
}

const CreateReviewLink = createComponent<Props>({
  props: {
    active: Boolean,
    canUndo: Boolean,
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
            <strong>This will remove access to the project.</strong> You
            will need to distribute a new link if you would like to start the review process again.
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
            <p class="italic">N.B. creating a review link will change the following permissions:</p>
            <ul class="italic p-0 list-disc">
              <li>
                The project cannot be deleted
              </li>
              <li>
                Datasets in the project cannot be deleted
              </li>
              <li>
                Datasets in the project cannot be removed
              </li>
            </ul>
            <p class="italic">These permissions can be restored by removing the link.</p>
            <Button
              onClick={submit}
              loading={state.loading}
              type="primary"
            >
              Create link
            </Button>
          </form>
        }
        {props.done && props.canUndo
          && <form>
            <div>
              <p class="m-0">Reviewers can access the project using this link:</p>
              <CopyToClipboard value={reviewLink.value} class="py-1" />
            </div>
            {props.canUndo
              && <Button
                onClick={undo}
              >
                Remove link
              </Button>
            }
          </form>
        }
      </WorkflowStep>
    )
  },
})

export default CreateReviewLink
