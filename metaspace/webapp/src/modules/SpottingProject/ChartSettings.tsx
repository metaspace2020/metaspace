import { defineComponent, reactive } from '@vue/composition-api'
import { Option, Popover, Select, Button } from '../../lib/element-ui'
import FadeTransition from '../../components/FadeTransition'
// @ts-ignore
import Colorbar from '../../components/Colorbar'

interface ChartSettingsState {
  colormap: string
  status: string
}

const availableScales: string[] = ['-Viridis', '-Cividis', '-Hot', '-YlGnBu', '-Portland', '-Greys',
  '-Inferno', '-Turbo', 'Viridis']

export const ChartSettings = defineComponent({
  name: 'ChartSettings',
  props: {
    defaultColormap: {
      type: String,
      default: '-YlGnBu',
    },
  },
  setup(props, ctx) {
    const { emit } = ctx
    const state = reactive<ChartSettingsState>({
      colormap: props.defaultColormap,
      status: 'CLOSED',
    })

    const handleColormapChange = (value: string) => {
      state.colormap = value
      emit('color', value)
    }

    return () => {
      return (
        <Popover
          trigger="click"
          placement="bottom">
          <Button
            slot="reference"
            style={{ color: 'gray' }}
            class="button-reset h-6 w-6 block ml-2">
            <i
              class="el-icon-setting text-xl pointer-events-none"
            />
          </Button>
          <FadeTransition class="m-0 leading-5 text-center">
            <div>
              <div class='flex-flex-col m-2'>
                <div class='text-left select-none mb-2'>Colormap</div>
                <Select
                  class='select-box-mini select-none'
                  value={state.colormap}
                  onChange={handleColormapChange}
                  placeholder='Class'
                  size='mini'>
                  {
                    availableScales.map((option: any) => {
                      return (
                        <Option label={option} value={option}>
                          <div class='h-full w-full py-2'>
                            <Colorbar class="h-full w-full"
                              map={option}
                              horizontal/>
                          </div>
                        </Option>
                      )
                    })
                  }
                </Select>
              </div>
            </div>
          </FadeTransition>
        </Popover>
      )
    }
  },
})
