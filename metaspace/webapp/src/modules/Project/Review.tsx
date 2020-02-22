import './review.css'

// import Vue from 'vue'
import { createComponent, computed } from '@vue/composition-api'
import { Button, Input } from 'element-ui'

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
      <li class={{ active: props.active, done: props.done }}>
        {slots.default()}
      </li>
    )
  },
})

function handleCopy(text: string | null) {
  if (text) {
    if ('clipboard' in navigator) {
      navigator.clipboard.writeText(text)
    } else {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'absolute'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      try {
        el.select()
        document.execCommand('copy')
      } finally {
        document.body.removeChild(el)
      }
    }
  }
}

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
      <ol class="sm-workflow">
        <WorkflowItem
          active={props.publicationStatus === statuses.UNPUBLISHED}
          done={
            props.publicationStatus === statuses.UNDER_REVIEW
            || props.publicationStatus === statuses.PUBLISHED
          }
        >
          <h2 class="sm-workflow-header">Create a review link</h2>
          <p>
            A review link allows reviewers to access this project and its datasets
            <br />
            <strong>without making the project available to everyone</strong>.
          </p>
          <form>
            {props.publicationStatus === statuses.UNPUBLISHED
              && <Button onClick={props.createLink} type="primary">
                Create link
              </Button>
            }
            {props.publicationStatus === statuses.UNDER_REVIEW
              && <Button onClick={props.deleteLink} type="info">
                Remove link
              </Button>
            }
          </form>
        </WorkflowItem>
        <WorkflowItem
          active={props.publicationStatus === statuses.UNDER_REVIEW}
          done={props.publicationStatus === statuses.PUBLISHED}
        >
          <h2 class="sm-workflow-header">Review in progress</h2>
          {props.publicationStatus === statuses.UNDER_REVIEW
            ? <form>
              <p>Reviewers can access this project using the following link:</p>
              <Input
                value={reviewLink.value}
                type="text"
                readonly
              >
                <Button
                  slot="append"
                  icon="el-icon-document-copy"
                  title="Copy to clipboard"
                  onClick={() => handleCopy(reviewLink.value)}
                />
              </Input>
              <p>Once review is complete, we encourage making data publicly available.</p>
              <Button onClick={props.publishProject} type="primary">
                Publish project
              </Button>
            </form>
            : <p>Reviewers can access this project with a link prior to publication.</p>
          }
        </WorkflowItem>
        <WorkflowItem
          active={props.publicationStatus === statuses.PUBLISHED}
          done={props.publicationStatus === statuses.PUBLISHED}
        >
          <h2 class="sm-workflow-header">Publish results</h2>
          {props.publicationStatus === statuses.PUBLISHED
            ? <p>This project and its datasets are now public.</p>
            : <p>This project and its datasets will be made public.</p>}
        </WorkflowItem>
      </ol>
    )
  },
})

export default ReviewLink
