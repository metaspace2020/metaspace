import { createComponent } from '@vue/composition-api'

import { PrimaryLabelText } from '../../components/Form'
import RichTextArea from '../../components/RichText/RichTextArea'

const Details = createComponent({
  props: {
    id: Number,
  },
  setup() {
    return () => (
      <div class="max-w-measure-3 mt-6 mx-auto mb-12 leading-6 h2-leading-12">
        <h2>Database details</h2>
        <form class="sm-form v-rhythm-6">
          <div class="w-3/4">
            <label for="database-name">
              <PrimaryLabelText>Name</PrimaryLabelText>
            </label>
            <el-input id="database-name"/>
          </div>
          <div class="flex items-end">
            <div class="w-1/4">
              <label for="database-version">
                <PrimaryLabelText>Version</PrimaryLabelText>
              </label>
              <el-input id="database-version"/>
            </div>
            <el-button class="ml-3 mb-1">
              Upload new version
            </el-button>
          </div>
          <div class="w-1/2">
            <label for="database-short-name">
              <PrimaryLabelText>Short name</PrimaryLabelText>
            </label>
            <el-input id="database-short-name"/>
          </div>
          <RichTextArea>
            <PrimaryLabelText slot="label">Description</PrimaryLabelText>
          </RichTextArea>
          <div>
            <label for="database-link">
              <PrimaryLabelText>Link</PrimaryLabelText>
            </label>
            <el-input id="database-link"/>
          </div>
          <RichTextArea>
            <PrimaryLabelText slot="label">Citation</PrimaryLabelText>
          </RichTextArea>
          <el-button type="primary">
            Update details
          </el-button>
        </form>
        <section class="margin-reset mt-12">
          <h2>Archive database</h2>
          <p>Database will not be available for processing new datasets.</p>
          <el-button class="mt-5">
            Archive database
          </el-button>
        </section>
        <section class="margin-reset mt-12">
          <h2>Delete database</h2>
          <p>Unprocessed dataset jobs using this database will also be removed.</p>
          <el-button type="danger" class="mt-5">
            Delete database
          </el-button>
        </section>
      </div>
    )
  },
})

export default Details
