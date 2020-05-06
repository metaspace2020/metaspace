import { createComponent, reactive } from '@vue/composition-api'
import { Button, Input } from 'element-ui'

import { WorkflowStep } from '../../../components/Workflow'
import { RichTextArea } from '../../../components/RichText'
import CopyToClipboard from '../../../components/CopyToClipboard'

import { ViewProjectResult } from '../../../api/project'
import { parseValidationErrors } from '../../../api/validation'
import router from '../../../router'

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
  updateProject: Function
  currentUserName: string
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

const PrepareProject = createComponent<Props>({
  props: {
    active: Boolean,
    currentUserName: String,
    done: Boolean,
    project: Object,
    updateProject: Function,
  },
  setup(props) {
    const state = reactive<State>({
      errors: {},
      loading: false,
      model: getInitialModel(props.project, props.currentUserName),
    })

    const submit = async() => {
      if (props.updateProject) {
        state.errors = {}
        state.loading = true
        try {
          await props.updateProject(state.model)
        } catch (e) {
          state.errors = parseValidationErrors(e)
        } finally {
          state.loading = false
        }
      }
    }

    const { href } = router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined, true)
    const projectUrlPrefix = location.origin + href.replace('REMOVE', '')

    return () => (
      <WorkflowStep
        active={props.active}
        done={props.done}
      >
        <h2 class="sm-workflow-header">Update project details</h2>
        {/* <p>Amend the suggestions below.</p> */}
        {props.active
          ? <form
            action="#"
            onSubmit={(e: Event) => { e.preventDefault(); submit() }}
          >
            <div class={{ 'sm-form-error': state.errors.urlSlug }}>
              <label for="project-review-url">
                <span class="text-base font-medium">Link to be used in the manuscript</span>
                <span class="block text-sm text-gray-800">
                  Must be unique and use characters a-z, 0-9, hyphen or underscore
                </span>
                {state.errors.urlSlug
                && <span class="block text-sm font-medium text-danger">
                  {state.errors.urlSlug}
                </span>}
              </label>
              <Input
                id="project-review-url"
                class="py-1"
                v-model={state.model.urlSlug}
                pattern="[a-zA-Z0-9_-]+"
                minlength="4"
                maxlength="50"
                title="a-z, 0-9, hyphen or underscore"
              >
                <span slot="prepend">{projectUrlPrefix}</span>
              </Input>
            </div>
            <div>
              <label for="project-review-title">
                <span class="text-base font-medium">Project title</span>
                <span class="block text-sm text-gray-800">
                  Suggested format: Author et al. (year) title
                </span>
              </label>
              <Input id="project-review-title" class="py-1" v-model={state.model.name} />
            </div>
            <RichTextArea
              content={state.model.projectDescription}
              onUpdate={(content: string) => {
                state.model.projectDescription = content
              }}
            >
              <span slot="label" class="text-base font-medium">Abstract</span>
              <span slot="label" class="block text-sm text-gray-800">Copy and paste here</span>
            </RichTextArea>
            {/* Button component does not submit the form *shrug* */}
            <button class="el-button el-button--primary">
              {state.loading && <i class="el-icon-loading" />}
              <span>
                Update
              </span>
            </button>
          </form>
          : <form
            action="#"
            onSubmit={(e: Event) => { e.preventDefault(); submit() }}
          >
            <p>Use this link in your manuscript:</p>
            <CopyToClipboard value={projectUrlPrefix + props.project.urlSlug} />
            <p>
              Edit the link in{' '}
              <router-link to="?tab=settings">
                Settings
              </router-link>
            </p>
          </form>
        }
      </WorkflowStep>
    )
  },
})

export default PrepareProject
