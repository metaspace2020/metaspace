import { defineComponent, reactive } from '@vue/composition-api'
import './DashboardPage.scss'
import { Option, Select } from '../../../../webapp/src/lib/element-ui'
import { orderBy } from 'lodash-es'

interface Options{
  xAxis: any
  yAxis: any
  aggregation: any
}

interface DashboardState {
  filter: any
  options: Options
  selectedView: number
}

const VIEW = {
  SCATTER: 1,
  HEATMAP: 2,
}

const AXIS_VALUES = [
  {
    label: 'Polarity',
    src: 'polarity',
  },
  {
    label: 'Adducts',
    src: 'adducts',
  },
  {
    label: 'Neutral losses',
    src: 'neutral losses',
  },
  {
    label: 'Matrix',
    src: 'matrix',
  },
  {
    label: 'Molecule',
    src: 'molecule',
  },
  {
    label: 'Technology',
    src: 'technology',
  },
  {
    label: 'Pathway',
    src: 'pathway',
  },
  {
    label: 'Class',
    src: 'class',
  },
  {
    label: 'Dataset',
    src: 'dataset',
  },
]

const AGGREGATED_VALUES = [
  {
    label: 'Prediction',
    src: 'prediction',
  },
  {
    label: 'Intensity',
    src: 'intensity',
  },
  {
    label: 'Simple count',
    src: 'count',
  },
]

const FILTER_VALUES = [
  {
    label: 'Polarity',
    src: 'polarity',
  },
  {
    label: 'Adducts',
    src: 'adducts',
  },
  {
    label: 'Neutral losses',
    src: 'neutral losses',
  },
  {
    label: 'Matrix',
    src: 'matrix',
  },
  {
    label: 'Prediction',
    src: 'prediction',
  },
  {
    label: 'Technology',
    src: 'technology',
  },
  {
    label: 'Pathway',
    src: 'pathway',
  },
  {
    label: 'Class',
    src: 'class',
  },
  {
    label: 'Dataset',
    src: 'dataset',
  },
  {
    label: 'Intensity',
    src: 'intensity',
  },
]

export default defineComponent({
  name: 'dashboard',
  setup: function(props, ctx) {
    const { $route, $store } = ctx.root
    const state = reactive<DashboardState>({
      filter: undefined,
      options: {
        xAxis: null,
        yAxis: null,
        aggregation: null,
      },
      selectedView: VIEW.SCATTER,
    })

    const renderFilters = () => {
      return (
        <div class='filter-container'>
          <div class='filter-box m-2'>
            <span class='x-axis-label mb-2'>X axis</span>
            <Select
              class='select-box-mini'
              value={state.options.xAxis}
              onChange={(value: number) => {
                state.options.xAxis = value
              }}
              placeholder='Class'
              size='mini'>
              {
                orderBy(AXIS_VALUES, ['label'], ['asc']).map((option: any) => {
                  return <Option label={option.label} value={option.src}/>
                })
              }
            </Select>
          </div>
          <div class='filter-box m-2'>
            <span class='y-axis-label mb-2'>Y axis</span>
            <Select
              class='select-box-mini'
              value={state.options.yAxis}
              onChange={(value: number) => {
                state.options.yAxis = value
              }}
              placeholder='Method'
              size='mini'>
              {
                orderBy(AXIS_VALUES, ['label'], ['asc']).map((option: any) => {
                  return <Option label={option.label} value={option.src}/>
                })
              }
            </Select>
          </div>
          <div class='filter-box m-2'>
            <span class='aggregation-label mb-2'>Aggregated method</span>
            <Select
              class='select-box-mini'
              value={state.options.aggregation}
              onChange={(value: number) => {
                state.options.aggregation = value
              }}
              placeholder='Method'
              size='mini'>
              {
                orderBy(AGGREGATED_VALUES, ['label'], ['asc']).map((option: any) => {
                  return <Option label={option.label} value={option.src}/>
                })
              }
            </Select>
          </div>
          <div class='filter-box m-2'>
            <span class='filter-label mb-2'>Filters</span>
            <div class='flex flex-wrap'>
              <Select
                class='select-box-mini mr-2'
                value={state.options.aggregation}
                onChange={(value: number) => {
                  state.options.aggregation = value
                }}
                placeholder='Neutral losses'
                size='mini'>
                {
                  orderBy(FILTER_VALUES, ['label'], ['asc']).map((option: any) => {
                    return <Option label={option.label} value={option.src}/>
                  })
                }
              </Select>
              <Select
                class='select-box-mini mr-2'
                value={state.options.aggregation}
                onChange={(value: number) => {
                  state.options.aggregation = value
                }}
                placeholder='Adduct'
                size='mini'>
                <Option label="5%" value={0.05}/>
                <Option label="10%" value={0.1}/>
                <Option label="20%" value={0.2}/>
                <Option label="50%" value={0.5}/>
              </Select>
            </div>
          </div>
        </div>
      )
    }

    const renderVisualizations = () => {
      return (
        <div class='visualization-container'>
          <div class='visualization-selector'>
            <span class='filter-label'>Visualization</span>
            <div class={`icon-holder ${state.selectedView === VIEW.SCATTER ? 'selected' : ''}`}>
              <i class="vis-icon el-icon-s-data mr-6 text-4xl" onClick={() => { state.selectedView = VIEW.SCATTER }}/>
            </div>
            <div class={`icon-holder ${state.selectedView === VIEW.HEATMAP ? 'selected' : ''}`}>
              <i class="vis-icon el-icon-s-grid mr-6 text-4xl" onClick={() => { state.selectedView = VIEW.HEATMAP }}/>
            </div>
          </div>
        </div>
      )
    }

    const renderDashboardInstructions = () => {
      return (
        <div class='dashboard-instructions'>
          <i class="el-icon-info mr-6 text-4xl"/>
          <div class='flex flex-col text-xs w-2/4'>
            <p class='instruction-title mb-2'>Steps:</p>
            <p>1 - Select the x axis metric in the <span class='x-axis-label'>red</span> zone;</p>
            <p>2 - Select the y axis metric in the <span class='y-axis-label'>green</span> zone;</p>
            <p>3 - Select the aggregated method (color) in the <span class='aggregation-label'>blue</span> zone;</p>
            <p>4 - Apply the filters you desire.</p>
          </div>
        </div>
      )
    }

    return () => {
      return (
        <div class={'dashboard-container'}>
          {renderFilters()}
          {renderVisualizations()}
          <div class={'content-container'}>
            {renderDashboardInstructions()}
          </div>
        </div>
      )
    }
  },
})
