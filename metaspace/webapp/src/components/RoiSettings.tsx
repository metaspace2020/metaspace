import VisibleIcon from '../assets/inline/refactoring-ui/icon-view-visible.svg'
import HiddenIcon from '../assets/inline/refactoring-ui/icon-view-hidden.svg'
import { defineComponent, computed, ref } from '@vue/composition-api'
import { Button, Input, Popover } from '../lib/element-ui'
import Vue from 'vue'
import ChannelSelector from '../modules/ImageViewer/ChannelSelector.vue'
import './RoiSettings.scss'

interface Props {
  roiInfo: any[],
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

export default defineComponent<Props>({
  name: 'RoiSettings',
  props: {
    roiInfo: { type: Array, default: () => [] },
  },
  setup(props, { root, emit }) {
    const { $store } = root
    const popover = ref(null)

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

    const triggerDownload = (index: number) => {
      emit('download', index)
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
          placement="bottom"
          width="200"
          trigger="click"
        >
          <div class='roi-content'>
            {
              roiInfo.map((roi: any, roiIndex: number) => {
                return (
                  <div class='roi-item relative'>
                    <div class='flex w-full justify-between items-center'>
                      {roi.name}
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
                        <Button
                          class="button-reset h-5"
                          icon="el-icon-download"
                          onClick={() => triggerDownload(roiIndex)}/>
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
