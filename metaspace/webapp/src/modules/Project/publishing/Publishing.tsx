import { defineComponent, computed, inject, defineAsyncComponent } from 'vue'

import { Workflow } from '../../../components/Workflow'
import UpdateProjectDetails from './UpdateProjectDetails'
import CreateReviewLink from './CreateReviewLink'
import PublishData from './PublishData'
import FadeTransition from '../../../components/FadeTransition'
import PrimaryIcon from '../../../components/PrimaryIcon.vue'

const GlobeSvg = defineAsyncComponent(() => import('../../../assets/inline/refactoring-ui/icon-globe.svg'))

import {
  updateProjectMutation,
  ViewProjectResult,
  createReviewLinkMutation,
  deleteReviewLinkMutation,
  publishProjectMutation,
  updateProjectDOIMutation,
} from '../../../api/project'
import { DefaultApolloClient } from '@vue/apollo-composable'

const statuses = {
  UNPUBLISHED: 'UNPUBLISHED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PUBLISHED: 'PUBLISHED',
}

interface Props {
  currentUserName: string
  project: ViewProjectResult
  refetchProject: Function
}

const ReviewWorkflow = defineComponent({
  props: {
    currentUserName: String,
    project: Object,
    refetchProject: Function,
  },
  setup(props: Props | any) {
    const apolloClient = inject(DefaultApolloClient)
    const activeStep = computed(() => {
      if (props.project.publicationStatus !== statuses.UNPUBLISHED) {
        return 3
      }
      if (props.project.urlSlug) {
        return 2
      }
      return 1
    })

    const projectId = computed(() => (props.project ? props.project.id : undefined))

    const updateProject = async (projectDetails: object) => {
      await apolloClient.mutate({
        mutation: updateProjectMutation,
        variables: {
          projectId: projectId.value,
          projectDetails,
        },
      })
      await props.refetchProject()
    }

    const createReviewLink = async () => {
      await apolloClient.mutate({
        mutation: createReviewLinkMutation,
        variables: { projectId: projectId.value },
      })
      await props.refetchProject()
    }

    const deleteReviewLink = async () => {
      await apolloClient.mutate({
        mutation: deleteReviewLinkMutation,
        variables: { projectId: projectId.value },
      })
      await props.refetchProject()
    }

    const publishProject = async (doi: string) => {
      await apolloClient.mutate({
        mutation: publishProjectMutation,
        variables: { projectId: projectId.value },
      })
      if (doi && doi.length) {
        await apolloClient.mutate({
          mutation: updateProjectDOIMutation,
          variables: { projectId: projectId.value, link: doi },
        })
      }
      await props.refetchProject()
    }

    return () => (
      <FadeTransition>
        {props.project.publicationStatus === statuses.PUBLISHED ? (
          <div class="leading-6 text-center mt-12">
            <PrimaryIcon class="mx-auto" large>
              <GlobeSvg />
            </PrimaryIcon>
            <h2 class="leading-12 m-0">Project is published</h2>
            <p class="m-0">
              The project and its datasets are now public.
              <br />
              Thank you for your contribution.
            </p>
          </div>
        ) : (
          <Workflow class="sm-scientific-publishing">
            <UpdateProjectDetails
              active={activeStep.value === 1}
              currentUserName={props.currentUserName}
              done={activeStep.value > 1}
              project={props.project}
              updateProject={updateProject}
            />
            <CreateReviewLink
              active={activeStep.value === 2}
              createLink={createReviewLink}
              deleteLink={deleteReviewLink}
              done={activeStep.value > 2}
              projectId={projectId.value}
              reviewToken={props.project.reviewToken || undefined}
            />
            <PublishData active={activeStep.value === 3} publishProject={publishProject} />
          </Workflow>
        )}
      </FadeTransition>
    )
  },
})

export default ReviewWorkflow
