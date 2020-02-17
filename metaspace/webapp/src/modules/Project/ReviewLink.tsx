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
      <section>
        <h2>Review Link</h2>
        <p>
          {props.publicationStatus}
        </p>
        <div>
          {reviewLink.value
            && <p>
              <a href={reviewLink.value}>{reviewLink.value}</a>
            </p>}
          {props.publicationStatus === 'UNPUBLISHED'
            && <Button onClick={props.createLink}>
              Create Link
            </Button>}
          {props.publicationStatus === 'UNDER_REVIEW'
            && <Button onClick={props.deleteLink} type="danger">
                Delete Link
            </Button>}
          {props.publicationStatus === 'UNDER_REVIEW'
            && <Button onClick={props.publishProject} type="success">
              Publish Project
            </Button>}
        </div>
      </section>
    )
  },
})

export default ReviewLink
