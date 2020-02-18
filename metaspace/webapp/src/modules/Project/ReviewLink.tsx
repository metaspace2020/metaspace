import './review.css'

// import Vue from 'vue'
import { createComponent, computed } from '@vue/composition-api'
import { Button } from 'element-ui'

const ReviewLink = createComponent({
  props: {
    projectId: String,
    reviewToken: String,
    publicationStatus: String,
    createLink: Function,
    deleteLink: Function,
    publishProject: Function,
  },
  setup(props) {
    const reviewLink = computed(() => {
      if (!props.projectId || !props.reviewToken) {
        return null
      }
      return `${window.location.origin}/api_auth/review?prj=${props.projectId}&token=${props.reviewToken}`
    })
    return () => (
      <ol class="sm-workflow sm-hipster-style">
        <li class="done">
          <h2>Create a review link</h2>
          <p>
            A review link allows reviewers to access this project and its datasets without making the project public.
          </p>
        </li>
        <li>
          <h2>Review in progress</h2>
          <p>Reviewers can access this project using the following link:</p>
          {reviewLink.value
            && <p>
              <a href={reviewLink.value}>{reviewLink.value}</a>
            </p>}
        </li>
        <li></li>
      </ol>
      // <div>
      //   <h2>{props.publicationStatus}</h2>
      //   {reviewLink.value && props.publicationStatus === 'UNDER_REVIEW'
      //   && <p>
      //     <a href={reviewLink.value}>{reviewLink.value}</a>
      //   </p>}
      //   {props.publicationStatus === 'UNPUBLISHED'
      //   && <Button onClick={props.createLink}>
      //     Create Link
      //   </Button>}
      //   {props.publicationStatus === 'UNDER_REVIEW'
      //   && <Button onClick={props.deleteLink} type="danger">
      //       Delete Link
      //   </Button>}
      //   {props.publicationStatus === 'UNDER_REVIEW'
      //   && <Button onClick={props.publishProject} type="success">
      //     Publish Project
      //   </Button>}
      // </div>
    )
  },
})

export default ReviewLink
