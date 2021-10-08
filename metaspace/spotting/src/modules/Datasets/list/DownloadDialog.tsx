import { computed, defineComponent, toRefs } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { DownloadLinkJson, GetDatasetDownloadLink, getDatasetDownloadLink } from '../../../api/dataset'
import safeJsonParse from '../../../lib/safeJsonParse'
import { Dialog } from '../../../lib/element-ui'

const getFilenameAndExt = (filename: string) => {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot !== -1) {
    const name = filename.slice(0, lastDot)
    const ext = filename.slice(lastDot)
    if (ext.toLowerCase() === '.imzml') {
      return [name, '.imzML']
    } else {
      return [name, ext.toLowerCase()]
    }
  }
  return [filename, '']
}

const FileIcon = defineComponent({
  props: { ext: { type: String, required: true } },
  setup(props) {
    return () => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 100" style="width: 32px; height: 50px">
        <linearGradient id="a" gradientUnits="userSpaceOnUse" x1="36" y1="99" x2="36" y2="1">
          <stop offset="0" stop-color="#c8d4db"/>
          <stop offset=".139" stop-color="#d8e1e6"/>
          <stop offset=".359" stop-color="#ebf0f3"/>
          <stop offset=".617" stop-color="#f9fafb"/>
          <stop offset="1" stop-color="#fff"/>
        </linearGradient>
        <path d="M45 1L71 27.7V99H1V1H45Z" fill="url(#a)" stroke="#7191a1" stroke-width="2"/>
        <linearGradient id="b" gradientUnits="userSpaceOnUse" x1="45.068" y1="27.796" x2="58.568" y2="14.395">
          <stop offset="0" stop-color="#fff"/>
          <stop offset=".35" stop-color="#fafbfb"/>
          <stop offset=".532" stop-color="#edf1f4"/>
          <stop offset=".675" stop-color="#dde5e9"/>
          <stop offset=".799" stop-color="#c7d3da"/>
          <stop offset=".908" stop-color="#adbdc7"/>
          <stop offset="1" stop-color="#92a5b0"/>
        </linearGradient>
        <path d="M45 1L71 27.7H45V1z" fill="url(#b)" stroke-width="2" stroke="#7191a1" stroke-linejoin="bevel"/>
        <text
          x="36"
          y="60"
          text-length="64"
          text-anchor="middle"
          font-size="20px"
          font-weight="bold"
          fill="#7191a1">
          {props.ext}
        </text>
      </svg>
    )
  },
})

const FileItem = defineComponent({
  props: {
    filename: { type: String, required: true },
    link: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const { filename, link } = props
      const [name, ext] = getFilenameAndExt(filename)

      return (
        <div class="flex items-center p-1 w-1/2 box-border">
          <a href={link}>
            <FileIcon ext={ext} />
          </a>
          <a href={link} class="flex mx-3 my-1 overflow-hidden">
            <span class="flex-shrink truncate">{name}</span>
            <span>{ext}</span>
          </a>
        </div>
      )
    }
  },
})

export default defineComponent({
  props: {
    datasetName: { type: String, required: true },
    datasetId: { type: String, required: true },
  },
  setup(props, { emit }) {
    const { datasetId } = toRefs(props)
    const {
      result: downloadLinkResult,
      loading,
    } = useQuery<GetDatasetDownloadLink>(getDatasetDownloadLink, { datasetId }, { fetchPolicy: 'no-cache' })
    const downloadLinks = computed<DownloadLinkJson>(() => downloadLinkResult.value != null
      ? safeJsonParse(downloadLinkResult.value.dataset.downloadLinkJson)
      : null)

    return () => {
      let content
      if (loading.value) {
        content = <div v-loading class="h-64" />
      } else if (downloadLinks.value == null) {
        content = <div><h1>Error</h1><p>This dataset cannot be downloaded.</p></div>
      } else {
        const { license, contributors, files } = downloadLinks.value
        const authorStr = contributors.length !== 1 ? 'authors' : 'author'
        content = (
          <div>
            <p>
              {license.code === 'NO-LICENSE'
                ? <p>
                  This dataset's submitter has not selected a license.
                  Please get approval from the {authorStr} before downloading or using this dataset in any way.
                </p>
                : <p>
                  This dataset is distributed under the{' '}
                  <a
                    href={license.link}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                  >{license.code}</a>
                  {' '}license.
                  Make sure to credit the {authorStr} of this dataset:
                </p>}
            </p>
            <ul>
              {contributors.map(({ name, institution }) =>
                <li class="list-none">{name}{institution && `, ${institution}`}</li>)}
            </ul>
            <h4>Files</h4>
            {files != null && files.length > 0
              ? <div class="flex my-1 flex-wrap">
                {files.map(({ filename, link }) => (
                  <FileItem filename={filename} link={link} />
                ))}
              </div>
              : <div class="text-gray-600 text-center items-center my-6">
                No files were found for this dataset.
              </div>}
            <p>
              <i>
              These download links expire after 30 minutes.
              </i>
            </p>
          </div>
        )
      }

      return (
        <Dialog
          visible
          lockScroll={false}
          onclose={() => emit('close')}
          title={`Download ${props.datasetName}`}
          customClass="el-dialog-lean max-w-xl"
        >
          {content.children}
        </Dialog>
      )
    }
  },
})
