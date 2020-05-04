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
  formActive: boolean
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
      formActive: false,
    })

    const submit = async() => {
      if (props.createLink) {
        state.errors = {}
        state.loading = true
        try {
          await props.createLink(state.formActive ? state.model : null)
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
        <p>
          <em>Reviewers will not need to create an account to gain access.</em>
        </p>
        {props.active
          && <form action="#" onSubmit={(e: Event) => { e.preventDefault(); submit() }}>
            <Collapse
              class="border-t border-b-0 box-border border-gray-200"
              onChange={() => { state.formActive = !state.formActive }}
              value={state.formActive ? 'projectdetails' : ''}
            >
              <CollapseItem title="Update project details (recommended)" name="projectdetails">
                <div>
                  <label for="project-review-title">Set the project name:</label>
                  <Input id="project-review-title" v-model={state.model.name} />
                </div>
                <div class={['mt-3', { 'sm-form-error': state.errors.urlSlug }]}>
                  <label for="project-review-url">Create a custom URL (a-z, 0-9, minus or underscore):</label>
                  { state.errors.urlSlug
                    && <p class="text-sm text-danger font-medium leading-4 m-0 mb-2">
                      {state.errors.urlSlug}
                    </p> }
                  <Input
                    id="project-review-url"
                    v-model={state.model.urlSlug}
                    pattern="[a-zA-Z0-9_-]+"
                    minlength="4"
                    maxlength="50"
                    title="(a-z, 0-9, minus or underscore)"
                  >
                    <span slot="prepend">{projectUrlPrefix}</span>
                  </Input>
                </div>
                <RichTextArea
                  class="mt-3"
                  content={state.model.projectDescription}
                  label="Add an abstract to the project description:"
                  onUpdate={(content: string) => {
                    state.model.projectDescription = content
                  }}
                />
              </CollapseItem>
            </Collapse>
            {/* Button component does not submit the form *shrug* */}
            <button class="el-button el-button--primary">
              {state.loading && <i class="el-icon-loading" />}
              <span>
                Create link {state.formActive && '& update details'}
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
