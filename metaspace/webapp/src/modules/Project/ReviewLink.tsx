// import Vue from 'vue'
import { createComponent, reactive, computed } from '@vue/composition-api'
import { Button } from 'element-ui'

interface Props {

}

const ReviewLink = createComponent<Props>({
  setup(props) {
    return () => (
      <section>
        <h2>Review Link</h2>
        <div class="explan-action">
          <p>
            Allow reviewers to access this project before publication.
          </p>
          <Button>
            Create Link
          </Button>
        </div>
      </section>
    )
  },
})

export default ReviewLink
