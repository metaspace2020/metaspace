import { defineComponent, reactive } from '@vue/composition-api'
import StatefulIcon from '../../../components/StatefulIcon.vue'
import { ExternalWindowSvg } from '../../../design/refactoringUIIcons'
import { Button, Popover } from '../../../lib/element-ui'
import Vue from 'vue'
import FadeTransition from '../../../components/FadeTransition'
import { useMutation } from '@vue/apollo-composable'
import gql from 'graphql-tag'
import safeJsonParse from '../../../lib/safeJsonParse'
import reportError from '../../../lib/reportError'
import useOutClick from '../../../lib/useOutClick'
import { omit } from 'lodash-es'

const RouterLink = Vue.component('router-link')
const saveSettings = gql`mutation saveImageViewerSnapshotMutation($input: ImageViewerSnapshotInput!) {
  saveImageViewerSnapshot(input: $input)
}`

interface DatasetComparisonShareLinkProps {
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

export const DatasetComparisonShareLink = defineComponent<DatasetComparisonShareLinkProps>({
  name: 'DatasetComparisonShareLink',
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
    const { mutate: settingsMutation } = useMutation<any>(saveSettings)
    const getUrl = () => {
      return {
        name: props.name,
        params: props.params,
        query: {
          ...props.query,
          row: props.selectedAnnotation,
          viewId: state.viewId,
        },
      }
    }

    const handleClick = async() => {
      state.status = 'SAVING'

      try {
        const filter = $store.getters.filter
        const settings = safeJsonParse(props.settings)
        const grid = settings.grid
        const datasetIds = Object.values(grid)
        const variables : any = {
          input: {
            version: 1,
            ionFormulas: [],
            dbIds: [],
            annotationIds: datasetIds,
            snapshot: JSON.stringify({
              nRows: props.nRows,
              nCols: props.nCols,
              query: props.query,
              colormap: props.colormap,
              scaleBarColor: props.scaleBarColor,
              scaleType: props.scaleType,
              lockedIntensityTemplate: props.lockedIntensityTemplate,
              globalLockedIntensities: props.globalLockedIntensities,
              grid,
              filter,
              mode: $store.state.mode,
              channels: $store.state.mode === 'MULTI' && Array.isArray($store.state.channels)
                ? $store.state.channels.map((annotation: any) => {
                  return annotation ? omit(annotation, 'annotations') : {}
                }) : [],
            }),
            datasetId: props.sourceDsId,
          },
        }
        const result = await settingsMutation(variables)
        state.viewId = result.data.saveImageViewerSnapshot
        state.status = 'HAS_LINK'
        useOutClick(() => { state.status = 'CLOSED' })
      } catch (e) {
        reportError(e)
        state.status = 'CLOSED'
      }
    }

    return () => {
      const { status } = state

      return (
        <Popover
          trigger="manual"
          placement="bottom"
          value={status !== 'CLOSED'}>
          <Button
            slot="reference"
            class="button-reset h-6 w-6 block ml-2"
            onClick={handleClick}>
            <StatefulIcon class="h-6 w-6 pointer-events-none">
              <ExternalWindowSvg class='fill-current'/>
            </StatefulIcon>
          </Button>
          <FadeTransition class="m-0 leading-5 text-center">
            {
              status === 'OPEN'
              && <p>Link to this annotation</p>
            }
            {
              status === 'SAVING'
              && <p>Saving</p>
            }
            {
              status === 'HAS_LINK'
              && <div>
                <RouterLink to={getUrl()} target="_blank">
                  Share this link
                </RouterLink>
                <span class="block text-xs tracking-wide">
                opens in a new window
                </span>
              </div>
            }
          </FadeTransition>
        </Popover>
      )
    }
  },
})
