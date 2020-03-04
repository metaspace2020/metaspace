import { computed, createComponent, toRefs, watch } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { DownloadLinkJson, GetDatasetDownloadLink, getDatasetDownloadLink } from '../../../api/dataset'
import safeJsonParse from '../../../lib/safeJsonParse'
import { Dialog } from 'element-ui'
import router from '../../../router'

const getExtension = (filename: string) => {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot !== -1) {
    const ext = filename.slice(lastDot)
    if (ext.toLowerCase() === '.imzml') {
      return '.imzML'
    } else {
      return ext.toLowerCase()
    }
  }
  return ''
}

const FileIcon = createComponent<{filename: string}>({
  props: { filename: { type: String, required: true } },
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
        <path d="M45 1L71 27.7H45V1z" fill="url(#b)"/><path d="M45 1l27 26.7H45V1z" fill-opacity="0" stroke="#7191a1" stroke-width="2" stroke-linejoin="bevel"/>
        <text x="36" y="60" text-length="64" text-anchor="middle" font-size="20px" font-weight="bold" fill="#7191a1">{getExtension(props.filename)}</text>
      </svg>
    )
  },
})

export default createComponent({
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
      && safeJsonParse(downloadLinkResult.value.dataset.downloadLinkJson))

    const datasetShareHref = computed(() => router.resolve({
      path: '/datasets',
      query: { ds: datasetId.value },
    }).href)

    return () => {
      let content
      if (loading.value) {
        content = <div v-loading style='min-height: 500px' />
      } else if (downloadLinks.value == null) {
        content = <div><h1>Error</h1><p>This dataset cannot be downloaded.</p></div>
      } else {
        const { license, contributors, files } = downloadLinks.value
        content = (
          <div>
            {license.code === 'NO-LICENSE'
              ? <p>
                This dataset's submitter has not selected a license.
                Please get approval from the submitter before downloading or using this dataset in any way.
              </p>
              : <p>
                This dataset is distributed under the <a href={license.link}>{license.name}</a>.
                Please check its terms before you download or use this dataset.
              </p>}

            <p>
              Make sure to credit the {contributors.length !== 1 ? 'authors' : 'author'} of this dataset:
            </p>
            <ul>
              {contributors.map(({ name, institution }) =>
                <li>{name}{institution && ', ' + institution}</li>)}
            </ul>
            <h4>Files</h4>
            <div>
              {files.map(({ filename, link }) => (
                <div style="display: flex; align-items: center; padding: 5px; margin: 5px 0;">
                  <a href={link}>
                    <FileIcon filename={getExtension(filename)} />
                  </a>
                  <a href={link} style="margin: 5px 10px">
                    {filename}
                  </a>
                </div>
              ))}
            </div>
            <p>
              <i>
              These download links expire after 30 minutes.
              </i>
            </p>
          </div>
        )
      }
      (window as any).content = content

      return (
        <Dialog
          visible
          lockScroll={false}
          onclose={() => emit('close')}
          title={`Download ${props.datasetName}`}
        >
          {content.children}
        </Dialog>
      )
    }
  },
})
