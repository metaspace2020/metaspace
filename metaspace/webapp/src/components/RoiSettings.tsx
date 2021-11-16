import VisibleIcon from '../assets/inline/refactoring-ui/icon-view-visible.svg'
import HiddenIcon from '../assets/inline/refactoring-ui/icon-view-hidden.svg'
import { defineComponent, computed, ref, reactive } from '@vue/composition-api'
import { Button, Input, Popover } from '../lib/element-ui'
import Vue from 'vue'
import ChannelSelector from '../modules/ImageViewer/ChannelSelector.vue'
import './RoiSettings.scss'
import { useQuery } from '@vue/apollo-composable'
import { annotationListQuery } from '../api/annotation'
import config from '../lib/config'
import { loadPngFromUrl, processIonImage } from '../lib/ionImageRendering'
import reportError from '../lib/reportError'
import isInsidePolygon from '../lib/isInsidePolygon'
import FileSaver from 'file-saver'

interface RoiSettingsProps {
  annotation: any,
}

interface RoiSettingsState {
  isDownloading: boolean,
  offset: number,
  rows: any[],
}

const channels: any = {
  magenta: 'rgb(255, 0, 255)',
  green: 'rgb(0, 255, 0)',
  blue: 'rgb(0, 0, 255)',
  red: 'rgb(255, 0, 0)',
  yellow: 'rgb(255, 255, 0)',
  cyan: 'rgb(0, 255, 255)',
  orange: 'rgb(255, 128, 0)',
  violet: 'rgb(128, 0, 255)',
  white: 'rgb(255, 255, 255)',
}

const CHUNK_SIZE = 10

export default defineComponent<RoiSettingsProps>({
  name: 'RoiSettings',
  props: {
    annotation: { type: Object, default: () => {} },
  },
  setup(props, { root, emit }) {
    const { $store } = root
    const popover = ref(null)
    const state = reactive<RoiSettingsState>({
      offset: 0,
      rows: [],
      isDownloading: false,
    })

    const queryVariables = () => {
      const filter = $store.getters.gqlAnnotationFilter
      const dFilter = $store.getters.gqlDatasetFilter
      const colocalizationCoeffFilter = $store.getters.gqlColocalizationFilter
      const query = $store.getters.ftsQuery

      return {
        filter,
        dFilter,
        query,
        colocalizationCoeffFilter,
        countIsomerCompounds: config.features.isomers,
      }
    }

    const queryOptions = reactive({ enabled: false, fetchPolicy: 'no-cache' as const })
    const queryVars = computed(() => ({
      ...queryVariables(),
      dFilter: { ...queryVariables().dFilter, ids: props.annotation.dataset.id },
      limit: CHUNK_SIZE,
      offset: state.offset,
    }))

    const {
      result: annotationsResult,
      loading: annotationsLoading,
      onResult: onAnnotationsResult,
    } = useQuery<any>(annotationListQuery, queryVars, queryOptions)

    onAnnotationsResult(async(result) => {
      if (result && result.data) {
        let rows = state.rows
        if (state.offset === 0) {
          rows = []
          let cols = ['mol_formula', 'adduct', 'mz', 'mol_name']
          const roiInfo = getRoi()
          cols = cols.concat(roiInfo.map((roi: any) => roi.name))
          rows.push(cols)
        }

        for (let i = 0; i < result.data.allAnnotations.length; i++) {
          const annotation = result.data.allAnnotations[i]
          const row = await formatRow(annotation)
          rows.push(row)
        }
        state.rows = rows

        if (state.offset < result.data.countAnnotations) {
          state.offset += CHUNK_SIZE
        } else {
          queryOptions.enabled = false
          const csv = state.rows.map((e: any) => e.join(',')).join('\n')
          const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
          FileSaver.saveAs(blob, 'rois.csv')
          state.isDownloading = false
          state.offset = 0
        }
      }
    })

    const ionImage = (ionImagePng: any, isotopeImage: any,
      scaleType: any = 'linear', userScaling: any = [0, 1], normalizedData: any = null) => {
      if (!isotopeImage || !ionImagePng) {
        return null
      }
      const { minIntensity, maxIntensity } = isotopeImage
      return processIonImage(ionImagePng, minIntensity, maxIntensity, scaleType
        , userScaling, undefined, normalizedData)
    }

    const formatRow = async(annotation: any) => {
      const [isotopeImage] = annotation.isotopeImages
      const ionImagePng = await loadPngFromUrl(isotopeImage.url)
      const molFormula : any = annotation.ionFormula
      const molName : any = annotation.ion
      const adduct : any = annotation.adduct
      const mz : any = annotation.mz
      const finalImage : any = ionImage(ionImagePng, annotation.isotopeImages[0])
      const row : any = [molFormula, adduct, mz, molName]
      const roiInfo = getRoi()
      const { width, height, intensityValues } = finalImage

      roiInfo.forEach((roi: any) => {
        const intensities = []

        for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) {
            if (isInsidePolygon([x, y],
              roi.coordinates.map((coordinate: any) => {
                return [coordinate.x, coordinate.y]
              }))) {
              const idx = y * width + x
              intensities.push(intensityValues[idx])
            }
          }
        }

        row.push(`"${intensities.join(',')}"`)
      })

      return row
    }

    const getRoi = () => {
      return $store.state.roiInfo || []
    }

    const addRoi = (e: any) => {
      e.stopPropagation()
      e.preventDefault()
      const roiInfo = getRoi()
      const index = roiInfo.length % Object.keys(channels).length
      const channel : any = Object.values(channels)[index]
      roiInfo.push({
        coordinates: [],
        channel: Object.keys(channels)[index],
        color: channel.replace('rgb', 'rgba').replace(')', ', 0.4)'),
        strokeColor: channel.replace('rgb', 'rgba').replace(')', ', 0.6)'),
        name: `ROI ${index + 1}`,
        visible: true,
      })
      $store.commit('setRoiInfo', roiInfo)
    }

    const openRoi = (e: any) => {
      e.stopPropagation()
      e.preventDefault()
    }

    const triggerDownload = () => {
      queryOptions.enabled = true
      state.isDownloading = true
    }

    const toggleHidden = (index: number) => {
      const roiInfo = getRoi()
      Vue.set(roiInfo, index, { ...roiInfo[index], visible: !roiInfo[index].visible })
      $store.commit('setRoiInfo', roiInfo)
    }

    const removeRoi = (index: number) => {
      const roiInfo = getRoi()
      roiInfo.splice(index, 1)
      $store.commit('setRoiInfo', roiInfo)
    }

    const changeRoi = (channel: any, index: number) => {
      const roiInfo = getRoi()
      Vue.set(roiInfo, index, {
        ...roiInfo[index],
        channel,
        strokeColor: channels[channel].replace('rgb', 'rgba').replace(')', ', 0.6)'),
        color: channels[channel].replace('rgb', 'rgba').replace(')', ', 0.4)'),
      })
      $store.commit('setRoiInfo', roiInfo)
    }

    return () => {
      const roiInfo = getRoi()

      return (
        <Popover
          ref={popover}
          popperClass='roi-popper'
          placement="bottom"
          width="200"
          trigger="click"
        >
          <div class='roi-content'>
            {
              roiInfo.length > 0
              && !state.isDownloading
              && <Button
                class="button-reset h-5"
                icon="el-icon-download"
                onClick={triggerDownload}/>
            }
            {
              state.isDownloading
              && <div>
                <i class="el-icon-loading" />
              </div>
            }
            {
              roiInfo.map((roi: any, roiIndex: number) => {
                return (
                  <div class='roi-item relative'>
                    <div class='flex w-full justify-between items-center'>
                      <span class='roi-label' style={ { color: roi.channel } }>
                        {roi.name}
                      </span>
                      <div class='flex justify-center items-center'>
                        <Button class="button-reset h-5" onClick={() => toggleHidden(roiIndex)}>
                          {
                            roi.visible
                            && <VisibleIcon class="fill-current w-5 h-5 text-gray-800"/>
                          } {
                            !roi.visible
                          && <HiddenIcon class="fill-current w-5 h-5 text-gray-800"/>
                          }
                        </Button>
                      </div>

                    </div>
                    <div class='roi-channels'>
                      <ChannelSelector
                        class="h-0 absolute bottom-0 left-0 right-0 flex justify-center items-end"
                        value={roi.channel}
                        onRemove={() => removeRoi(roiIndex)}
                        onInput={(value: any) => changeRoi(value, roiIndex)}
                      />
                    </div>
                  </div>
                )
              })
            }
            <Button
              class="button-reset h-9 rounded-lg flex items-center justify-center px-2 hover:bg-gray-100 w-full"
              onClick={addRoi}
            >
              Add ROI
            </Button>
          </div>
          <Button
            slot="reference"
            class="roi-badge button-reset h-9 rounded-lg flex items-center justify-center px-2 hover:bg-gray-100"
            icon="el-icon-add-location"
            onClick={openRoi}
          >
            Regions of interest
          </Button>
        </Popover>
      )
    }
  },

})
