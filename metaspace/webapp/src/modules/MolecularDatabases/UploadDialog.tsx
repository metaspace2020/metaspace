import './UploadDialog.css'

import { defineComponent, reactive, onMounted, ref } from '@vue/composition-api'
import { ApolloError } from 'apollo-client-preset'

import { PrimaryLabelText } from '../../components/Form'
import UppyUploader from '../../components/UppyUploader/UppyUploader.vue'
import FadeTransition from '../../components/FadeTransition'

import { createDatabaseQuery, MolecularDBDetails } from '../../api/moldb'
import safeJsonParse from '../../lib/safeJsonParse'
import reportError from '../../lib/reportError'

const convertToS3 = (url: string) => {
  const parsedUrl = new URL(url)
  const bucket = parsedUrl.host.split('.')[0]
  return `s3://${bucket}/${decodeURIComponent(parsedUrl.pathname.slice(1))}`
}

const uppyOptions = {
  debug: true,
  autoProceed: true,
  restrictions: {
    maxFileSize: 150 * 2 ** 20, // 150MB
    maxNumberOfFiles: 1,
    allowedFileTypes: ['.tsv', '.csv'],
  },
  meta: {},
}

const formatErrorMsg = (e: ApolloError) : ErrorMessage => {
  if (e.graphQLErrors && e.graphQLErrors.length) {
    const [error] = e.graphQLErrors
    const message = safeJsonParse(error.message)
    if (message?.type === 'already_exists') {
      return {
        message: 'This database already exists, please use a different name or version.',
      }
    }
    if (message?.type === 'malformed_csv') {
      return {
        message: 'The file format does not look correct. Please check that the file is tab-separated'
        + ' and contains three columns: id, name, and formula.',
      }
    }
    if (message?.type === 'bad_data') {
      return {
        message: 'Some rows contain bad data, please check these rows and re-upload the file.',
        details: message.details.map((d: any) => `Line ${d.line}: ${d.row.join(', ')}`),
      }
    }
  }
  return { message: 'Something went wrong, please try again later.' }
}

interface Props {
  name: string,
  details?: MolecularDBDetails,
  groupId: string,
}

type ErrorMessage = {
  message: string
  details?: string[]
}

interface State {
  model: {
    name: string,
    version: string,
    filePath: string,
  },
  loading: boolean,
  error: ErrorMessage | null,
}

const UploadDialog = defineComponent<Props>({
  name: 'UploadDialog',
  props: {
    name: String,
    details: Object,
    groupId: String,
  },
  setup(props, { emit, root }) {
    const state = reactive<State>({
      model: {
        name: props.name,
        version: '',
        filePath: '',
      },
      loading: false,
      error: null,
    })

    const isNewVersion = !!props.name

    const handleClose = () => {
      if (!state.loading) {
        emit('close')
      }
    }

    const handleUploadSuccess = (fileName: string, filePath: string) => {
      state.model.filePath = convertToS3(filePath)
      if (!state.model.name) {
        state.model.name = fileName.substr(0, fileName.lastIndexOf('.')) || fileName
      }
    }

    const handleRemoveFile = () => {
      state.model.filePath = ''
    }

    const createDatabase = async() => {
      state.error = null
      state.loading = true
      try {
        await root.$apollo.mutate({
          mutation: createDatabaseQuery,
          variables: {
            input: {
              isPublic: false,
              ...props?.details,
              ...state.model,
              groupId: props.groupId,
            },
          },
        })
        emit('done')
      } catch (e) {
        reportError(e, null)
        state.error = formatErrorMsg(e)
        state.loading = false
      }
    }

    const nameInput = ref<HTMLInputElement | null>(null)
    const versionInput = ref<HTMLInputElement | null>(null)
    const focusHandler = () => {
      const inputRef = isNewVersion ? versionInput : nameInput
      if (inputRef.value !== null) {
        inputRef.value.focus()
      }
    }

    // need to do this otherwise the `opened` event doesn't fire
    const visible = ref(false)
    onMounted(() => { visible.value = true })

    return () => (
      <el-dialog
        visible={visible.value}
        append-to-body
        title="Upload database"
        onClose={handleClose}
        class="sm-database-upload-dialog"
        onOpened={focusHandler}
      >
        <FadeTransition>
          { state.error
            && <div class="flex items-start mb-3 text-danger text-sm leading-5">
              <i class="el-icon-warning-outline mr-2 text-lg" />
              <div>
                <p class="m-0 flex items-start font-medium">
                  {state.error.message}
                </p>
                { state.error.details
                  && <ul class="overflow-y-auto m-0 mt-3 pl-6 max-h-25">
                    { state.error.details.map(d => <li>{d}</li>) }
                  </ul> }
              </div>
            </div> }
        </FadeTransition>
        <form class="sm-form flex leading-6">
          <div class="flex-grow">
            <label for="database-name">
              <PrimaryLabelText>Name</PrimaryLabelText>
            </label>
            <el-input
              ref="nameInput"
              id="database-name"
              v-model={state.model.name}
              disabled={isNewVersion || state.loading}
            />
          </div>
          <div class="w-1/4 ml-3">
            <label for="database-version">
              <PrimaryLabelText>Version</PrimaryLabelText>
            </label>
            <el-input
              ref="versionInput"
              id="database-version"
              v-model={state.model.version}
              disabled={state.loading}
            />
          </div>
        </form>
        <p class="m-0 mt-3">
          Databases should be provided in{' '}
          <a href="https://en.wikipedia.org/wiki/Tab-separated_values">TSV format</a>.
        </p>
        <h4 class="m-0 mt-3 font-medium">
          Example file:
        </h4>
        <pre class="m-0 mt-3">
          id{'\t'}name{'\t'}formula{'\n'}
          1{'\t'}1-Methylhistidine{'\t'}C7H11N3O2{'\n'}
          2{'\t'}13-Diaminopropane{'\t'}C3H10N2{'\n'}
          5{'\t'}2-Ketobutyric acid{'\t'}C4H6O3{'\n'}
        </pre>
        <UppyUploader
          class="mt-6"
          companionURL={`${window.location.origin}/database_upload`}
          uploadSuccessful={handleUploadSuccess}
          removeFile={handleRemoveFile}
          disabled={state.loading}
          uppyOptions={uppyOptions}
          requiredFiles={['.tsv']}
        />
        <span slot="footer">
          <el-button
            type="primary"
            onClick={createDatabase}
            disabled={!state.model.filePath || !state.model.name}
            loading={state.loading}
          >
            Continue
          </el-button>
        </span>
      </el-dialog>
    )
  },
})

export default UploadDialog
