import { defineComponent, reactive } from 'vue'
import {ElOption, ElPopover, ElSelect, ElButton, ElIcon} from 'element-plus'
import FadeTransition from '../../components/FadeTransition'
import {Setting} from "@element-plus/icons-vue";
import Colorbar from "../../components/Colorbar.vue";
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
        <ElPopover
          trigger="click"
          placement="bottom"
          v-slots={{
            reference: () => (
              <ElButton
                slot="reference"
                style={{color: 'gray'}}
                class="button-reset h-6 w-6 block ml-2">
                <ElIcon class=" text-xl pointer-events-none">
                  <Setting/>
                </ElIcon>
              </ElButton>
            ),
            default: () => (
              <FadeTransition class="m-0 leading-5 text-center">
                <div>
                  <div class='flex-flex-col m-2'>
                    <div class='text-left select-none mb-2'>Colormap</div>
                    <ElSelect
                      class='select-box-mini select-none'
                      modelValue={state.colormap}
                      onChange={handleColormapChange}
                      placeholder='Class'
                      size='small'>
                      {
                        availableScales.map((option: any) => {
                          return (
                            <ElOption label={option} value={option}>
                              <div class='h-full w-full py-2'>
                                <Colorbar class="h-full w-full"
                                          map={option}
                                          horizontal/>
                              </div>
                            </ElOption>
                          )
                        })
                      }
                    </ElSelect>
                  </div>
                </div>
              </FadeTransition>
            ),
          }}/>
      )
    }
  },
})
