import { computed, defineComponent, onMounted, reactive } from '@vue/composition-api'
import Overlay from '../../../../modules/ImageViewer/Overlay.vue'
import FadeTransition from '../../../../components/FadeTransition'
import { Button } from '../../../../lib/element-ui'
import CandidateMoleculesPopover from '../../../Annotations/annotation-widgets/CandidateMoleculesPopover.vue'
import MolecularFormula from '../../../../components/MolecularFormula'
import VisibleIcon from '../../../../assets/inline/refactoring-ui/icon-view-visible.svg'
import HiddenIcon from '../../../../assets/inline/refactoring-ui/icon-view-hidden.svg'
import RangeSlider from '../../../../components/Slider/RangeSlider.vue'
import IonIntensity from '../../../ImageViewer/IonIntensity.vue'
import getColorScale from '../../../../lib/getColorScale'
import { THUMB_WIDTH } from '../../../../components/Slider'
import { renderScaleBar } from '../../../../lib/ionImageRendering'
import createColormap from '../../../../lib/createColormap'
import './MultiChannelController.scss'

interface MultiChannelControllerProps {
  menuItems: any[],
  activeLayer: any
}

interface MultiChannelControllerState {
  refsLoaded: boolean
}

export const MultiChannelController = defineComponent<MultiChannelControllerProps>({
  name: 'MultiChannelController',
  props: {
    menuItems: { type: Array, default: () => [] },
    activeLayer: { type: Object },
  },
  // @ts-ignore
  setup: function(props, { refs, emit, root }) {
    const state = reactive<MultiChannelControllerState>({
      refsLoaded: false,
    })

    onMounted(() => {
      state.refsLoaded = true
    })

    const handleToggleVisibility = (itemIndex: number) => {
      emit('toggleVisibility', itemIndex)
    }

    const buildRangeSliderStyle = (item: any, key: number, scaleRange: number[] = [0, 1]) => {
      if (!refs[`range-slider-${key}`]) {
        return null
      }

      const width = refs[`range-slider-${key}`]?.offsetWidth + 30
      const { range } = getColorScale(item.settings.channel.value)
      const scaledMinIntensity = item.scaledMinIntensity.value
      const scaledMaxIntensity = item.scaledMaxIntensity.value
      const minColor = range[0]
      const maxColor = range[range.length - 1]
      const scaleBarUrl = item.scaleBar.value
      const gradient = scaledMinIntensity === scaledMaxIntensity
        ? `linear-gradient(to right, ${range.join(',')})`
        : item.scaleBar.value ? `url(${scaleBarUrl})` : ''
      const [minScale, maxScale] = scaleRange
      const minStop = Math.ceil(THUMB_WIDTH + ((width - THUMB_WIDTH * 2) * minScale))
      const maxStop = Math.ceil(THUMB_WIDTH + ((width - THUMB_WIDTH * 2) * maxScale))
      return {
        background: [
          `0px / ${minStop}px 100% linear-gradient(${minColor},${minColor}) no-repeat`,
          `${minStop}px / ${maxStop - minStop}px 100% ${gradient} repeat-y`,
          `${minColor} ${maxStop}px / ${width - maxStop}px 100% linear-gradient(${maxColor},${maxColor}) no-repeat`,
        ].join(','),
      }
    }

    const renderItem = (item: any, itemIndex: number) => {
      // @ts-ignore TS2604
      const candidateMolecules = (annotation) => <CandidateMoleculesPopover
        placement="right"
        limit={10}
        possibleCompounds={annotation.possibleCompounds}
        isomers={annotation.isomers}
        isobars={annotation.isobars}>
        <MolecularFormula
          class="truncate font-medium h-6 text-base"
          ion={annotation.ion}
        />
      </CandidateMoleculesPopover>

      return (
        <div class="flex flex-col justify-center p-2">
          <p class="flex justify-between m-0 items-center flex-wrap">
            {candidateMolecules(item.annotation)}
            <Button
              title={item.settings.visible ? 'Hide layer' : 'Show layer'}
              class="button-reset h-5"
              onClick={() => { handleToggleVisibility(itemIndex) }}
            >
              {
                item.settings.visible
                && <VisibleIcon class="fill-current w-5 h-5 text-gray-800"/>
              }
              {
                !item.settings.visible
                && <HiddenIcon class="fill-current w-5 h-5 text-gray-600"/>
              }
            </Button>
            <div
              ref={`range-slider-${itemIndex}`}
              class="h-9 relative w-full">

              {
                state.refsLoaded
                && <RangeSlider
                  class="ds-comparison-opacity-item"
                  value={item.userScaling}
                  min={0}
                  max={1}
                  step={0.01}
                  style={buildRangeSliderStyle(item, itemIndex)}
                />
              }
              {/* <div */}
              {/*  class="ds-intensities-wrapper"> */}
              {/*  <IonIntensity */}
              {/*    intensities={item.intensity?.min} */}
              {/*    label="Minimum intensity" */}
              {/*    placeholder="min." */}
              {/*  /> */}
              {/*  <IonIntensity */}
              {/*    intensities={item.intensity?.max} */}
              {/*    label="Minimum intensity" */}
              {/*    placeholder="min." */}
              {/*  /> */}
              {/* </div> */}
            </div>
          </p>
        </div>
      )
    }

    return () => {
      const { activeLayer, menuItems } = props

      return (
        <Overlay class="multi-channel-ctrl-wrapper overflow-x-hidden overflow-y-auto px-0 sm-menu-items">
          {
            menuItems.map((item: any, itemIndex: number) => renderItem(item, itemIndex))
          }
          <Button
            class={'button-reset p-3 h-12 w-full cursor-default text-gray-700 text-center m-0'} >
            <FadeTransition className="text-xs tracking-wide font-medium text-inherit">
              {
                activeLayer
                  && <span
                    key="active"
                  >
                  Select annotation
                  </span>
              }
              {
                !activeLayer
                  && <span
                    key="inactive"
                    class="flex items-center justify-center"
                  >
                  Add ion image
                  </span>
              }
            </FadeTransition>
          </Button>
        </Overlay>
      )
    }
  },
})
