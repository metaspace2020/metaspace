import { createComponent, computed } from '@vue/composition-api'

import { Workflow } from '../../../components/Workflow'
import PrepareProject from './PrepareProject'
import CreateReviewLink from './CreateReviewLink'
import PublishData from './PublishData'

import {
  updateProjectMutation, UpdateProjectMutation,
  ViewProjectResult,
  createReviewLinkMutation,
  deleteReviewLinkMutation,
  publishProjectMutation,
  updateProjectDOIMutation,
} from '../../../api/project'

const statuses = {
  UNPUBLISHED: 'UNPUBLISHED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PUBLISHED: 'PUBLISHED',
}

interface Props {
  currentUserName: string,
  project: ViewProjectResult
  refetchProject: Function,
}

const ReviewWorkflow = createComponent<Props>({
  props: {
    currentUserName: String,
    project: Object,
    refetchProject: Function,
  },
  setup(props, { root }) {
    const activeStep = computed(() => {
      if (!props.project) {
        return 1
      }
      return Object.keys(statuses).indexOf(props.project.publicationStatus) + 1
    })

    const projectId = computed(() => props.project ? props.project.id : undefined)

    const createReviewLink = async(projectDetails: object) => {
      if (projectDetails) {
        await root.$apollo.mutate<UpdateProjectMutation>({
          mutation: updateProjectMutation,
          variables: {
            projectId: projectId.value,
            projectDetails,
          },
        })
      }
      await root.$apollo.mutate({
        mutation: createReviewLinkMutation,
        variables: { projectId: projectId.value },
      })
      await props.refetchProject()
    }

    const deleteReviewLink = async() => {
      await root.$apollo.mutate({
        mutation: deleteReviewLinkMutation,
        variables: { projectId: projectId.value },
      })
      await props.refetchProject()
    }

    const publishProject = async(doi: string) => {
      if (doi && doi.length) {
        await root.$apollo.mutate({
          mutation: updateProjectDOIMutation,
          variables: { projectId: projectId.value, link: `https://doi.org/${doi}` },
        })
      }
      await root.$apollo.mutate({
        mutation: publishProjectMutation,
        variables: { projectId: projectId.value },
      })
      await props.refetchProject()
    }

    return () => (
      <Workflow class="sm-scientific-publishing">
        <PrepareProject
          active={activeStep.value === 1}
          currentUserName={props.currentUserName}
          done={activeStep.value > 1}
          project={props.project}
        />
        <CreateReviewLink
          active={activeStep.value === 2}
          done={activeStep.value > 2}
          canUndo={activeStep.value === 3}
          createLink={createReviewLink}
          deleteLink={deleteReviewLink}
          project={props.project}
        />
        <PublishData
          active={activeStep.value === 3}
          done={props.project.publicationStatus === 'PUBLISHED'}
          projectId={projectId.value}
          publishProject={publishProject}
          reviewToken={props.project.reviewToken || undefined}
        />
        {/* <h2 class="sm-workflow-header">Publish the data</h2>
          {activeStep.value === 3
            ? <p>This project and its datasets are now public, thank you for your contribution.</p>
            : <p>This project and its datasets will be made public.</p>}
        </WorkflowStep> */}
      </Workflow>
    )
  },
})

export default ReviewWorkflow
