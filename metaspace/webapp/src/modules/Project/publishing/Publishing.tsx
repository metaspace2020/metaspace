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
import FadeTransition from '../../../components/FadeTransition'

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
      if (props.project.publicationStatus !== statuses.UNPUBLISHED) {
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
      <FadeTransition>
        {props.project.publicationStatus === statuses.PUBLISHED
          ? <div class="leading-6 text-center mt-12">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="fill-current h-6 w-6 block w-8 h-8 p-2 rounded-full bg-blue-100 mx-auto">
              { /* eslint-disable */ }
              <circle cx="12" cy="12" r="10" class="text-blue-800"></circle>
              <path class="text-blue-300" d="M2.05 11A10 10 0 0 1 15 2.46V6a2 2 0 0 1-2 2h-1v1a2 2 0 0 1-1 1.73V12h2a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v2.14A9.97 9.97 0 0 1 12 22v-4h-1a2 2 0 0 1-2-2v-2a2 2 0 0 1-2-2v-1H2.05z"></path>
              { /* eslint-enable */}
            </svg>
            <h2 class="leading-10 py-1 m-0">Project is published</h2>
            <p class="m-0">
              The project and its datasets are now public.
              <br />
              Thank you for your contribution.
            </p>
          </div>
          : <Workflow class="sm-scientific-publishing">
            <PrepareProject
              active={activeStep.value === 1}
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
              publishProject={publishProject}
            />
          </Workflow>}
      </FadeTransition>
    )
  },
})

export default ReviewWorkflow
