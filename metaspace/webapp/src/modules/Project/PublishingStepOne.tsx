import { createComponent, reactive } from '@vue/composition-api'
import { Button, Input, Collapse, CollapseItem } from 'element-ui'

import { WorkflowStep } from '../../components/Workflow'
import { RichTextArea } from '../../components/RichText'
import confirmPrompt from '../../components/confirmPrompt'

import { ViewProjectResult } from '../../api/project'
import { parseValidationErrors } from '../../api/validation'
import router from '../../router'

function getInitialModel(project: ViewProjectResult, currentUserName = '') {
  const year = new Date().getFullYear()
  const nameParts = currentUserName.split(' ')
  const surname = nameParts.length ? nameParts[nameParts.length - 1] : null
  const citation = `${surname} et al. (${year})`
  const newProjectName = surname && !project.name.startsWith(citation) ? `${citation} ${project.name}` : null
  return {
    name: newProjectName || project.name,
    urlSlug: surname ? `${surname.toLowerCase()}-${year}` : project.urlSlug,
    projectDescription: project.projectDescription,
  }
}

interface Props {
  active: boolean
  canUndo: boolean
  createLink: Function
  currentUserName: string
  deleteLink: Function
  done: boolean
  project: ViewProjectResult
}

interface State {
  errors: { [field: string]: string }
  loading: boolean
  model: {
    name: string,
    urlSlug: string | null,
    projectDescription: string | null
  }
}

const ReviewStepOne = createComponent<Props>({
  props: {
    active: Boolean,
    canUndo: Boolean,
    createLink: Function,
    currentUserName: String,
    deleteLink: Function,
    done: Boolean,
    project: Object,
  },
  setup(props) {
    const state = reactive<State>({
      errors: {},
      loading: false,
      model: getInitialModel(props.project, props.currentUserName),
    })

    const submit = async() => {
      if (props.createLink) {
        state.errors = {}
        state.loading = true
        try {
          await props.createLink(state.model)
        } catch (e) {
          state.errors = parseValidationErrors(e)
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

    const { href } = router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined, true)
    const projectUrlPrefix = location.origin + href.replace('REMOVE', '')

    return () => (
      <WorkflowStep
        active={props.active}
        done={props.done}
      >
        <h2 class="sm-workflow-header">Create link for reviewers</h2>
        <p>
          A review link allows reviewers to access this project and its datasets{' '}
          <strong>without making the project available to everyone</strong>.
        </p>
        {props.active
          && <form
            action="#"
            class="border-0 border-t border-gray-200"
            onSubmit={(e: Event) => { e.preventDefault(); submit() }}
          >
            <p><em>Please review the suggested updates below before continuing:</em></p>
            <div class={{ 'sm-form-error': state.errors.urlSlug }}>
              <label for="project-review-url">
                <span class="text-base font-bold">Custom URL</span>
                <br />
                <span class="block text-sm font-medium leading-5">
                  This is the link that you should use in the manuscript.
                </span>
                <span class="block text-sm leading-5">
                  It must be unique and use characters a-z, 0-9, minus or underscore.
                </span>
              </label>
              { state.errors.urlSlug
                && <p class="text-sm text-danger font-medium leading-5 mt-1 mb-2">
                  {state.errors.urlSlug}
                </p> }
              <Input
                id="project-review-url"
                class="mt-1"
                v-model={state.model.urlSlug}
                pattern="[a-zA-Z0-9_-]+"
                minlength="4"
                maxlength="50"
                title="a-z, 0-9, minus or underscore"
              >
                <span slot="prepend">{projectUrlPrefix}</span>
              </Input>
            </div>
            <div>
              <label for="project-review-title">Set the project name:</label>
              <Input id="project-review-title" v-model={state.model.name} />
            </div>
            <RichTextArea
              content={state.model.projectDescription}
              label="Add an abstract to the project description:"
              onUpdate={(content: string) => {
                state.model.projectDescription = content
              }}
            />
            {/* Button component does not submit the form *shrug* */}
            <button class="el-button el-button--primary">
              {state.loading && <i class="el-icon-loading" />}
              <span>
                Update & create link
              </span>
            </button>
          </form>
        }
        {props.canUndo
          && <form onSubmit={(e: Event) => e.preventDefault()}>
            <Button
              onClick={undo}
              key={props.project.publicationStatus}
            >
              Remove link
            </Button>
          </form>
        }
      </WorkflowStep>
    )
  },
})

export default ReviewStepOne
