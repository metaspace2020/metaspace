import { createComponent, reactive } from '@vue/composition-api'
import { Button, Input, Collapse, CollapseItem } from 'element-ui'

import { WorkflowItem } from '../../components/Workflow'
import { RichTextArea } from '../../components/RichText'
import confirmPrompt from '../../components/confirmPrompt'

import { ViewProjectResult } from '../../api/project'
import { parseValidationErrors } from '../../api/validation'

function getInitialProjectData(project: ViewProjectResult, currentUserName = '') {
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
  active: boolean,
  canUndo: boolean,
  createLink: Function,
  currentUserName: string,
  deleteLink: Function,
  done: boolean,
  project: ViewProjectResult
}

const EnablePeerReview = createComponent<Props>({
  props: {
    active: Boolean,
    canUndo: Boolean,
    createLink: Function,
    currentUserName: String,
    deleteLink: Function,
    done: Boolean,
    project: Object,
  },
  setup(props, { root }) {
    const state = reactive({
      errors: {},
      loading: false,
      projectData: getInitialProjectData(props.project, props.currentUserName),
      updateProject: false,
    })

    const submit = async() => {
      if (props.createLink) {
        state.loading = true
        state.errors = {}
        try {
          await props.createLink(state.updateProject ? state.projectData : null)
        } catch (e) {
          state.errors = parseValidationErrors(e)
        }
        state.loading = false
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

    const { href } = root.$router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined, true)
    const projectUrlPrefix = location.origin + href.replace('REMOVE', '')

    return () => (
      <WorkflowItem
        active={props.active}
        done={props.done}
      >
        <h2 class="sm-workflow-header">Enable peer review</h2>
        <p>
          A review link allows reviewers to access this project and its datasets <strong>without making the project available to everyone</strong>.
        </p>
        <p>
          <em>Reviewers will not need to create an account to gain access.</em>
        </p>
        {props.active
          && <form onSubmit={(e: Event) => e.preventDefault()}>
            <Collapse
              class="border-t border-b-0 box-border border-gray-200"
              onChange={() => { state.updateProject = !state.updateProject }}
              value={state.updateProject ? 'projectdetails' : ''}
            >
              <CollapseItem title="Update project details (recommended)" name="projectdetails">
                <div>
                  <label for="project-review-title">Set the project name:</label>
                  <Input id="project-review-title" v-model={state.projectData.name} />
                </div>
                <div class="mt-3">
                  <label for="project-review-url">Create a custom URL:</label>
                  <Input id="project-review-url" v-model={state.projectData.urlSlug}>
                    <span slot="prepend">{projectUrlPrefix}</span>
                  </Input>
                </div>
                <RichTextArea
                  class="mt-3"
                  content={state.projectData.projectDescription}
                  label="Add an abstract to the project description:"
                  onUpdate={(content: string) => {
                    state.projectData.projectDescription = content
                  }}
                />
              </CollapseItem>
            </Collapse>
            <Button
              key={props.project.publicationStatus}
              loading={state.loading}
              onClick={submit}
              type="primary"
            >
              Create link {state.updateProject && '& update details'}
            </Button>
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
      </WorkflowItem>
    )
  },
})

export default EnablePeerReview
