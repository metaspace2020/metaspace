import { createComponent, reactive } from '@vue/composition-api'
import { Button } from 'element-ui'

import { WorkflowStep } from '../../../components/Workflow'
import confirmPrompt from '../../../components/confirmPrompt'

interface Props {
  active: boolean
  canUndo: boolean
  createLink: Function
  deleteLink: Function
  done: boolean
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
  },
  setup(props) {
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
        <p>
          A review link allows reviewers to access this project and its datasets{' '}
          <strong>without making the project available to everyone.</strong>
        </p>
        <p>
          <em>Reviewers will not need an account to gain access.</em>
        </p>
        {props.active
          && <form onSubmit={(e: Event) => e.preventDefault()}>
            <Button
              onClick={submit}
              loading={state.loading}
              type="primary"
            >
              Create link
            </Button>
          </form>
        }
        {props.canUndo
          && <form onSubmit={(e: Event) => e.preventDefault()}>
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
