import './UploadDialog.css'

import { createComponent, reactive } from '@vue/composition-api'

import { PrimaryLabelText } from '../../components/Form'
import UppyUploader from './UppyUploader'

import { createDatabaseQuery } from '../../api/moldb'

const convertToS3 = (url: string) => {
  const parsedUrl = new URL(url)
  const bucket = parsedUrl.host.split('.')[0]
  return `s3://${bucket}/${decodeURIComponent(parsedUrl.pathname.slice(1))}`
}

const UploadDialog = createComponent({
  props: {
    name: String,
    version: String,
    groupId: String,
  },
  setup(props, { emit, root }) {
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

    const createDatabase = async(fileName: string, filePath: string) => {
      await root.$apollo.mutate({
        mutation: createDatabaseQuery,
        variables: {
          input: {
            name: state.model.name || fileName,
            version: state.model.version,
            filePath: convertToS3(filePath),
            groupId: props.groupId,
          },
        },
      })
      handleClose()
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
          uploadSuccessful={createDatabase}
          slot="footer"
        />
      </el-dialog>
    )
  },
})

export default UploadDialog
