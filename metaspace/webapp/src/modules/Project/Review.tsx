import './Review.css'

import { createComponent, computed, reactive } from '@vue/composition-api'
import { Button, Input, Collapse, CollapseItem } from 'element-ui'

import CopyToClipboard from '../../components/CopyToClipboard'
import { RichTextArea } from '../../components/RichText'

import { ViewProjectResult } from '../../api/project'

const statuses = {
  UNPUBLISHED: 'UNPUBLISHED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PUBLISHED: 'PUBLISHED',
}

const WorkflowItem = createComponent({
  props: {
    active: Boolean,
    done: Boolean,
  },
  setup(props, { slots }) {
    return () => (
      <li class={[
        'sm-workflow-item',
        'flex flex-col relative text-gray-600 max-w-measure-3 ml-8 pl-12',
        'border-solid border-0 border-l-2 border-gray-200',
        'transition-colors ease-in-out duration-300',
        { active: props.active, done: props.done },
      ]}>
        {slots.default()}
      </li>
    )
  },
})

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
  project: ViewProjectResult
  currentUserName: string,

  createLink: Function,
  deleteLink: Function,
  publishProject: Function,
}

const ReviewLink = createComponent<Props>({
  props: {
    project: Object,
    createLink: Function,
    deleteLink: Function,
    publishProject: Function,
    currentUserName: String,
  },
  setup(props, { root }) {
    const reviewLink = computed(() => {
      if (!props.project || !props.project.reviewToken) {
        return undefined
      }
      return `${window.location.origin}/api_auth/review?prj=${props.project.id}&token=${props.project.reviewToken}`
    })

    const activeStep = computed(() => {
      if (!props.project) {
        return 1
      }
      return Object.keys(statuses).indexOf(props.project.publicationStatus) + 1
    })

    const state = reactive({
      doi: '',
      loading: false,
      projectData: getInitialProjectData(props.project, props.currentUserName),
      updateProject: false,
    })

    const enablePeerReview = async() => {
      if (props.createLink) {
        state.loading = true
        await props.createLink(state.updateProject ? state.projectData : null)
        state.loading = false
      }
    }

    const { href } = root.$router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined, true)
    const projectUrlPrefix = location.origin + href.replace('REMOVE', '')

    return () => (
      <ol class="sm-workflow">
        <WorkflowItem
          active={activeStep.value === 1}
          done={activeStep.value > 1}
        >
          <h2 class="sm-workflow-header">Enable peer review</h2>
          <p>
            A review link allows reviewers to access this project and its datasets <strong>without making the project available to everyone</strong>.
          </p>
          <p>
            <em>Reviewers will not need to create an account to gain access.</em>
          </p>
          {activeStep.value === 1
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
                onClick={enablePeerReview}
                type="primary"
              >
                Create link {state.updateProject && '& update details'}
              </Button>
            </form>
          }
          {activeStep.value === 2
            && <form onSubmit={(e: Event) => e.preventDefault()}>
              <Button
                onClick={props.deleteLink}
                type="info"
                key={props.project.publicationStatus}
              >
                Remove link
              </Button>
            </form>
          }
        </WorkflowItem>
        <WorkflowItem
          active={activeStep.value === 2}
          done={activeStep.value > 2}
        >
          <h2 class="sm-workflow-header">Review in progress</h2>
          {activeStep.value === 2
            ? <form onSubmit={(e: Event) => e.preventDefault()}>
              <p>Reviewers can access this project using the following link:</p>
              <CopyToClipboard value={reviewLink.value} />
              <p>Once review is complete, we encourage making data publicly available.</p>
              <div>
                <label for="project-review-doi">Link the project to the publication with a DOI:</label>
                <Input id="project-review-doi" v-model={state.doi} label="Add the DOI for your paper to the project:">
                  <span slot="prepend">https://doi.org/</span>
                  <a slot="append" href={`https://doi.org/${state.doi}`} target="_blank" rel="noopener" class="text-gray-600">
                    Test link
                  </a>
                </Input>
              </div>
              <Button onClick={() => props.publishProject(state.doi)} type="primary">
                Publish project
              </Button>
            </form>
            : <p>Reviewers will have access to this project prior to publication.</p>
          }
        </WorkflowItem>
        <WorkflowItem
          active={activeStep.value === 3}
          done={activeStep.value === 3}
        >
          <h2 class="sm-workflow-header">Publish the data</h2>
          {activeStep.value === 3
            ? <p>This project and its datasets are now public, thank you for your contribution.</p>
            : <p>This project and its datasets will be made public.</p>}
        </WorkflowItem>
      </ol>
    )
  },
})

export default ReviewLink
