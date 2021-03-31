import './UploadDialog.css'

import { defineComponent, reactive, onMounted, ref } from '@vue/composition-api'
import { ApolloError } from 'apollo-client-preset'
import { UppyOptions, UploadResult } from '@uppy/core'

import { SmForm, PrimaryLabelText } from '../../components/Form'
import UppyUploader from '../../components/UppyUploader/UppyUploader.vue'
import FadeTransition from '../../components/FadeTransition'

import { createDatabaseQuery, MolecularDBDetails } from '../../api/moldb'
import safeJsonParse from '../../lib/safeJsonParse'
import reportError from '../../lib/reportError'
import { convertUploadUrlToS3Path } from '../../lib/util'

const uppyOptions : UppyOptions = {
  debug: true,
  autoProceed: true,
  restrictions: {
    maxFileSize: 150 * 2 ** 20, // 150MB
    maxNumberOfFiles: 1,
    allowedFileTypes: ['.tsv', '.csv'],
  },
  meta: {},
}

const s3Options = {
  companionUrl: `${window.location.origin}/database_upload`,
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

    const handleUploadComplete = (result: UploadResult) => {
      if (result.successful.length) {
        const [file] = result.successful
        // The path part of file.uploadURL is double-URI-encoded for some reason (slashes in the path are %2F,
        // spaces in the filename are %2520). Decode it once to get a regular URI (slashes are /, spaces are %20).
        state.model.filePath = convertUploadUrlToS3Path(decodeURIComponent(file.uploadURL))
        if (!state.model.name) {
          state.model.name = file.name.substr(0, file.name.lastIndexOf('.')) || file.name
        }
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
        <SmForm class="flex leading-6">
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
        </SmForm>
        <p class="m-0 mt-3">
          Databases should be provided in{' '}
          <a href="https://en.wikipedia.org/wiki/Tab-separated_values">TSV format</a>.
        </p>
        <h4 class="m-0 mt-3 font-medium">
          Example file:
        </h4>
        <pre class="m-0 mt-3">
          id{'\t'}name{'\t'}formula{'\n'}
          HMDB0000122{'\t'}Glucose{'\t'}C6H12O6{'\n'}
          HMDB0000169{'\t'}Mannose{'\t'}C6H12O6{'\n'}
          HMDB0000094{'\t'}Citric acid{'\t'}C6H8O7{'\n'}
        </pre>
        <UppyUploader
          class="mt-6"
          disabled={state.loading}
          options={uppyOptions}
          s3Options={s3Options}
          onFile-removed={handleRemoveFile} /* ugly alert */
          onComplete={handleUploadComplete}
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
