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
      if (props.project.publicationStatus === statuses.PUBLISHED) {
        return 4
      }
      if (props.project.publicationStatus === statuses.UNDER_REVIEW) {
        return 3
      }
      if (props.project.urlSlug) {
        return 2
      }
      return 1
    })

    const projectId = computed(() => props.project ? props.project.id : undefined)

    const updateProject = async(projectDetails: object) => {
      await root.$apollo.mutate<UpdateProjectMutation>({
        mutation: updateProjectMutation,
        variables: {
          projectId: projectId.value,
          projectDetails,
        },
      })
      await props.refetchProject()
    }

    const createReviewLink = async() => {
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
          canUndo={props.project.publicationStatus !== statuses.PUBLISHED}
          currentUserName={props.currentUserName}
          done={activeStep.value > 1}
          project={props.project}
          updateProject={updateProject}
        />
        <CreateReviewLink
          active={activeStep.value === 2}
          done={activeStep.value > 2}
          canUndo={activeStep.value === 3}
          createLink={createReviewLink}
          deleteLink={deleteReviewLink}
          projectId={projectId.value}
          reviewToken={props.project.reviewToken || undefined}
        />
        <PublishData
          active={activeStep.value === 3}
          done={props.project.publicationStatus === statuses.PUBLISHED}
          publishProject={publishProject}
        />
      </Workflow>
    )
  },
})

export default ReviewWorkflow
