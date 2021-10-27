import { defineComponent, reactive } from '@vue/composition-api'
import { Popover } from '../../lib/element-ui'
import Vue from 'vue'
import FadeTransition from '../../components/FadeTransition'

const RouterLink = Vue.component('router-link')

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

export const ShareLink = defineComponent<ShareLinkProps>({
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
  setup(props, ctx) {
    const { $store, $route } = ctx.root
    const state = reactive({
      status: 'CLOSED',
      viewId: null,
    })

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
        <Popover
          trigger="hover"
          placement="bottom">
          <div
            slot="reference"
            style={{ color: 'gray' }}
            className="h-6 w-6 pointer-events-none">
            <i
              class="el-icon-share"
            />
          </div>
          <FadeTransition class="m-0 leading-5 text-center">
            <div>
              <RouterLink to={getUrl()} target="_blank">
                  Share this link
              </RouterLink>
              <span class="block text-xs tracking-wide">
                opens in a new window
              </span>
            </div>
          </FadeTransition>
        </Popover>
      )
    }
  },
})
