import './UploadDialog.css'

import { defineComponent, reactive, onMounted, ref, inject } from 'vue'
import { UppyOptions, UploadResult } from '@uppy/core'

import { SmForm, PrimaryLabelText } from '../../components/Form'
import UppyUploader from '../../components/UppyUploader/UppyUploader.vue'
import FadeTransition from '../../components/FadeTransition'

import { ElDialog, ElInput, ElButton, ElIcon } from '../../lib/element-plus'

import { createDatabaseQuery, MolecularDBDetails } from '../../api/moldb'
import safeJsonParse from '../../lib/safeJsonParse'
import reportError from '../../lib/reportError'
import { convertUploadUrlToS3Path } from '../../lib/util'
import { DefaultApolloClient } from '@vue/apollo-composable'
import { Warning } from '@element-plus/icons-vue'

const uppyOptions: UppyOptions = {
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

const formatErrorMsg = (e: any): ErrorMessage => {
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
        message:
          'The file format does not look correct. Please check that the file is tab-separated' +
          ' and contains three columns: id, name, and formula.',
      }
    }
    if (message?.type === 'max_rows_exceeded') {
      return {
        message: 'The file exceeds the maximum allowed number of rows (100,000).',
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
  name: string
  details?: MolecularDBDetails
  groupId: string
}

type ErrorMessage = {
  message: string
  details?: string[]
}

interface State {
  model: {
    name: string
    version: string
    filePath: string
  }
  loading: boolean
  error: ErrorMessage | null
}

const UploadDialog = defineComponent({
  name: 'UploadDialog',
  props: {
    name: String,
    details: Object,
    groupId: String,
  },
  setup(props: Props | any, { emit }) {
    const apolloClient = inject(DefaultApolloClient)
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

    const createDatabase = async () => {
      state.error = null
      state.loading = true
      try {
        await apolloClient.mutate({
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

    const nameInput = ref(null)
    const versionInput = ref(null)
    const focusHandler = () => {
      const inputRef = isNewVersion ? versionInput : nameInput
      if (inputRef.value !== null) {
        inputRef.value.focus()
      }
    }

    // need to do this otherwise the `opened` event doesn't fire
    const visible = ref(false)
    onMounted(() => {
      visible.value = true
    })

    const renderFooter = () => {
      return (
        <span>
          <ElButton
            type="primary"
            onClick={createDatabase}
            disabled={!state.model.filePath || !state.model.name}
            loading={state.loading}
          >
            Continue
          </ElButton>
        </span>
      )
    }

    return () => (
      <ElDialog
        modelValue={visible.value}
        append-to-body
        title="Upload database"
        onClose={handleClose}
        modalClass="sm-database-upload-dialog"
        onOpened={focusHandler}
        v-slots={{ footer: renderFooter }}
      >
        <FadeTransition>
          {state.error && (
            <div class="flex items-start mb-3 text-danger text-sm leading-5">
              <div>
                <p class="m-0 flex items-center font-medium">
                  <ElIcon name="mr-2 text-lg">
                    <Warning />
                  </ElIcon>
                  {state.error.message}
                </p>
                {state.error.details && (
                  <ul class="overflow-y-auto m-0 mt-3 pl-6 max-h-25">
                    {state.error.details.map((d) => (
                      <li>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </FadeTransition>
        <SmForm class="flex leading-6">
          <div class="flex-grow">
            <label for="database-name">
              <PrimaryLabelText>Name</PrimaryLabelText>
            </label>
            <ElInput
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
            <ElInput ref="versionInput" id="database-version" v-model={state.model.version} disabled={state.loading} />
          </div>
        </SmForm>
        <p class="m-0 mt-3">
          Databases should be provided in{' '}
          <a href="https://en.wikipedia.org/wiki/Tab-separated_values" target="_blank">
            TSV format
          </a>
          .
        </p>
        <p class="m-0 mt-1">
          Having trouble uploading the database? Follow our{' '}
          <a href="https://github.com/metaspace2020/metaspace/wiki/Custom-database" target="_blank">
            instructions
          </a>
          .
        </p>
        <h4 class="m-0 mt-3 font-medium">Example file:</h4>
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
      </ElDialog>
    )
  },
})

export default UploadDialog
