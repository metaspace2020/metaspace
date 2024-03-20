import { defineComponent } from 'vue'
import { ElIcon, ElPopover } from '../../lib/element-plus'
import FadeTransition from '../../components/FadeTransition'
import RouterLink from '../../components/RouterLink'
import { Share } from '@element-plus/icons-vue'

interface ShareLinkProps {
  name: string
  params: any
  query: any
  viewId: string
  nCols: number
  nRows: number
  settings: string
  colormap: string
  scaleType: string
  scaleBarColor: string
  sourceDsId: string
  selectedAnnotation: number
  lockedIntensityTemplate: string
  globalLockedIntensities: [number | undefined, number | undefined]
}

export const ShareLink = defineComponent({
  name: 'ShareLink',
  props: {
    name: { type: String, required: true },
    params: { type: Object },
    query: { type: Object },
    viewId: { type: String },
    nCols: { type: Number },
    nRows: { type: Number },
    settings: { type: String },
    colormap: { type: String },
    scaleType: { type: String },
    sourceDsId: { type: String },
    scaleBarColor: { type: String },
    selectedAnnotation: { type: Number },
    lockedIntensityTemplate: { type: String },
    globalLockedIntensities: { type: Array },
  },
  setup(props: ShareLinkProps) {
    const getUrl = () => {
      return {
        name: props.name,
        params: props.params,
        query: {
          ...props.query,
        },
      }
    }

    return () => {
      return (
        <ElPopover
          trigger="hover"
          placement="bottom"
          v-slots={{
            reference: () => (
              <div style={{ color: 'gray' }} class="h-6 w-6 flex items-center">
                <ElIcon>
                  <Share />
                </ElIcon>
              </div>
            ),
            default: () => (
              <FadeTransition class="m-0 leading-5 text-center">
                <div>
                  <RouterLink newTab to={getUrl()} target="_blank">
                    Share this link
                  </RouterLink>
                  <span class="block text-xs tracking-wide">opens in a new window</span>
                </div>
              </FadeTransition>
            ),
          }}
        />
      )
    }
  },
})
