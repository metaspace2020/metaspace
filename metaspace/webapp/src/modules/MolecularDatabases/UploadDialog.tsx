import './UploadDialog.css'

import { createComponent, reactive } from '@vue/composition-api'

import { PrimaryLabelText } from '../../components/Form'
import UppyUploader from './UppyUploader.vue'

const UploadDialog = createComponent({
  props: {
    name: String,
    version: String,
  },
  setup(props, { emit }) {
    const state = reactive({
      model: {
        name: props.name,
        version: '',
      },
      isNewVersion: !!props.name,
    })

    const handleClose = () => {
      // if (!this.isSubmitting) {
      emit('close')
      // }
    }

    return () => (
      <el-dialog
        visible
        append-to-body
        title="Upload database"
        onClose={handleClose}
        class="sm-database-upload-dialog"
      >
        <form class="sm-form flex leading-6">
          <div class="flex-grow">
            <label for="database-name">
              <PrimaryLabelText>Name</PrimaryLabelText>
            </label>
            <el-input
              id="database-name"
              v-model={state.model.name}
              disabled={state.isNewVersion}
            />
          </div>
          <div class="w-1/4 ml-3">
            <label for="database-version">
              <PrimaryLabelText>Version</PrimaryLabelText>
            </label>
            <el-input
              id="database-version"
              v-model={state.model.version}
            />
          </div>
        </form>
        <p>
          Databases should be provided in CSV format with three columns:
        </p>
        <dl>
          <div>
            <dt>id</dt>
            <dd>a numeric identifier</dd>
          </div>
          <div>
            <dt>name</dt>
            <dd>the scientific name of the molecule</dd>
          </div>
          <div>
            <dt>formula</dt>
            <dd>
              the molecular formula indicating the counts of each element,
              without structural information such as bonds or repeated groups
            </dd>
          </div>
        </dl>
        <UppyUploader
          slot="footer"
        />
      </el-dialog>
    )
  },
})

export default UploadDialog
