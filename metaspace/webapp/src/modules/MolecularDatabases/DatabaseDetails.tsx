import { createComponent } from '@vue/composition-api'

import { PrimaryLabelText } from '../../components/Form'

const Details = createComponent({
  props: {
    goBack: { type: Function, required: true },
  },
  setup() {
    return () => (
      <form class="sm-form max-w-measure-3 mx-auto">
        <h2>Database details</h2>
        <div class="flex-grow">
          <label for="database-name">
            <PrimaryLabelText>Name</PrimaryLabelText>
          </label>
          <el-input id="database-name"/>
        </div>
      </form>
    )
  },
})

export default Details
