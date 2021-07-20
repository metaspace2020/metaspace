import { computed, defineComponent, reactive } from '@vue/composition-api'
import { Select, Option, RadioGroup, Radio, InputNumber, Button } from '../../../lib/element-ui'

import './DatasetBrowserPage.scss'

interface DatasetBrowserProps {
  className: string
}

interface DatasetBrowserState {
  peakFilter: number
  fdrFilter: number | undefined
  databaseFilter: number | string | undefined
  mzmScoreFilter: number | undefined
  mzmPolarityFilter: number | undefined
  mzmScaleFilter: string | undefined
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
}

export default defineComponent<DatasetBrowserProps>({
  name: 'DatasetBrowserPage',
  props: {
    className: {
      type: String,
      default: 'dataset-browser',
    },
  },
  setup(props, ctx) {
    const { $router, $route } = ctx.root
    const state = reactive<DatasetBrowserState>({
      peakFilter: PEAK_FILTER.ALL,
      fdrFilter: undefined,
      databaseFilter: undefined,
      mzmScoreFilter: undefined,
      mzmPolarityFilter: undefined,
      mzmScaleFilter: undefined,
    })

    const datasetId = computed(() => $route.params.dataset_id)

    const handleFilterClear = () => {
      state.peakFilter = PEAK_FILTER.ALL
      state.fdrFilter = undefined
      state.databaseFilter = undefined
      state.mzmScoreFilter = undefined
      state.mzmPolarityFilter = undefined
      state.mzmScaleFilter = undefined
    }

    const renderBrowsingFilters = () => {
      return (
        <div class='dataset-browser-holder-filter-box'>
          <span class='font-semibold'>Browsing filters</span>
          <div class='flex flex-row w-full items-end'>
            <RadioGroup
              class='w-3/5'
              onInput={(value: any) => {
                state.peakFilter = value
                if (value === PEAK_FILTER.FDR && !state.fdrFilter) {
                  state.fdrFilter = 0.5
                }
              }}
              value={state.peakFilter}
              size='mini'>
              <Radio class='w-full' label={PEAK_FILTER.ALL}>All Peaks</Radio>
              <div>
                <Radio label={PEAK_FILTER.FDR}>Only annotated at FDR</Radio>
                <Select
                  class='select-box-mini'
                  value={state.fdrFilter}
                  onChange={(value: number) => {
                    state.fdrFilter = value
                    state.peakFilter = PEAK_FILTER.FDR
                  }}
                  placeholder='5%'
                  size='mini'>
                  <Option label="5%" value={0.05}/>
                  <Option label="10%" value={0.1}/>
                  <Option label="50%" value={0.5}/>
                </Select>
              </div>
            </RadioGroup>
            <div class='flex flex-col w-1/4'>
              <span>Database</span>
              <Select
                value={state.databaseFilter}
                size='mini'
                onChange={(value: number) => {
                  state.databaseFilter = value
                }}
                placeholder='HMDB-v4'>
                <Option label="HMDB" value={1}/>
                <Option label="Lipdmaps" value={2}/>
              </Select>
            </div>
          </div>
        </div>
      )
    }

    const renderImageFilters = () => {
      return (
        <div class='dataset-browser-holder-filter-box mt-2'>
          <span class='font-semibold'>Image filters</span>
          <div class='flex flex-row w-full items-end mt-2'>
            <span class='mr-2'>m/z</span>
            <InputNumber
              class='mr-2'
              value={state.mzmScoreFilter}
              onChange={(value: number) => { state.mzmScoreFilter = value }}
              precision={4}
              step={0.0001}
              size='mini'
              placeholder='174.0408'
            />
            <span class='mr-2'>+-</span>
            <InputNumber
              class='mr-2 select-box'
              value={state.mzmPolarityFilter}
              onChange={(value: number) => { state.mzmPolarityFilter = value }}
              precision={1}
              step={0.01}
              size='mini'
              placeholder='2.5'
            />
            <Select
              class='select-box-mini'
              value={state.mzmScaleFilter}
              onChange={(value: string) => {
                state.mzmScaleFilter = value
              }}
              size='mini'
              placeholder='ppm'>
              <Option label="DA" value='DA'/>
              <Option label="ppm" value='ppm'/>
            </Select>
          </div>
        </div>
      )
    }

    const renderFilterBox = () => {
      return (
        <div>
          {renderImageFilters()}
          {renderBrowsingFilters()}
          <Button class='clear-btn' size='mini' onClick={handleFilterClear}>
            Clear
          </Button>
          <Button class='filter-btn' type='primary' size='mini'>
            Filter
          </Button>
        </div>
      )
    }

    const renderEmptySpectrum = () => {
      return (
        <div class='dataset-browser-empty-spectrum'>
          <i class="el-icon-info info-icon mr-6"/>
          <div class='flex flex-col text-xs w-3/4'>
            <p class='font-semibold mb-2'>Steps:</p>
            <p>1 - Select a pixel on the image viewer</p>
            <p>2 - Apply the filter you desire</p>
            <p>3 - The interaction is multi-way, so you can also update the ion image via spectrum interaction</p>
          </div>
        </div>
      )
    }

    return () => {
      return (
        <div class={'dataset-browser-container'}>
          <div class={'dataset-browser-wrapper w-full lg:w-1/2'}>
            <div class='dataset-browser-holder'>
              <div class='dataset-browser-holder-header'>
                Spectrum browser
              </div>
              {renderFilterBox()}
              {renderEmptySpectrum()}
            </div>
          </div>
          <div class='dataset-browser-wrapper w-full lg:w-1/2'>
          </div>
        </div>
      )
    }
  },
})
