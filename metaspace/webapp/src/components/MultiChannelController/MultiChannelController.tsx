import { defineComponent, onMounted, reactive, ref } from 'vue'
import FadeTransition from '../FadeTransition'
import { ElButton, ElPopover } from '../../lib/element-plus'
import CandidateMoleculesPopover from '../../modules/Annotations/annotation-widgets/CandidateMoleculesPopover.vue'
import MolecularFormula from '../MolecularFormula'
import VisibleIcon from '../../assets/inline/refactoring-ui/icon-view-visible.svg'
import HiddenIcon from '../../assets/inline/refactoring-ui/icon-view-hidden.svg'
import RangeSlider from '../Slider/RangeSlider.vue'
import IonIntensity from '../../modules/ImageViewer/IonIntensity.vue'
import getColorScale from '../../lib/getColorScale'
import { THUMB_WIDTH } from '../Slider'
import ChannelSelector from '../../modules/ImageViewer/ChannelSelector.vue'
import ClippingNotice from '../../modules/ImageViewer/ClippingNotice.vue'
import './MultiChannelController.scss'

interface MultiChannelControllerState {
  refsLoaded: boolean
}

export const MultiChannelController = defineComponent({
  name: 'MultiChannelController',
  props: {
    menuItems: { type: Array, default: () => [] },
    activeLayer: { type: Boolean, default: false },
    isNormalized: { type: Boolean, default: false },
    showClippingNotice: { type: Boolean, default: false },
    mode: { type: String, default: 'MULTI' },
  },
  // @ts-ignore
  setup: function (props, { emit }) {
    const state = reactive<MultiChannelControllerState>({
      refsLoaded: false,
    })

    const popover = ref<any>(null)

    onMounted(() => {
      state.refsLoaded = true
    })

    const refs = ref({})

    const setRef = (el, index) => {
      if (el) {
        // Construct a unique key for each element
        const key = `range-slider-${index}`
        refs.value[key] = el
      }
    }

    const handleIonIntensityLockChange = (value: number | undefined, index: number, type: string) => {
      emit('intensityLockChange', value, index, type)
    }

    const handleIonIntensityChange = (intensity: number | undefined, index: number, type: string) => {
      emit('intensityChange', intensity, index, type)
    }

    const handleScalingChange = (userScaling: any, index: number) => {
      emit('change', userScaling, index)
    }

    const handleToggleVisibility = (itemIndex: number) => {
      emit('toggleVisibility', itemIndex)
    }

    const removeLayer = (itemIndex: number) => {
      emit('removeLayer', itemIndex)
    }

    const changeLayerColor = (value: string, itemIndex: number) => {
      emit('changeLayer', value, itemIndex)
    }

    const buildRangeSliderStyle = (item: any, key: number, scaleRange: number[] = [0, 1]) => {
      const width = (refs.value[`range-slider-${key}`]?.offsetWidth || 200) + 30
      const { range } = getColorScale(item.settings.channel)
      const scaledMinIntensity = item.scaledMinIntensity
      const scaledMaxIntensity = item.scaledMaxIntensity
      const minColor = range[0]
      const maxColor = range[range.length - 1]
      const scaleBarUrl = item.scaleBar
      const gradient =
        scaledMinIntensity === scaledMaxIntensity
          ? `linear-gradient(to right, ${range.join(',')})`
          : item.scaleBar
          ? `url(${scaleBarUrl})`
          : ''
      const [minScale, maxScale] = scaleRange
      const minStop = Math.ceil(THUMB_WIDTH + (width - THUMB_WIDTH * 2) * minScale)
      const maxStop = Math.ceil(THUMB_WIDTH + (width - THUMB_WIDTH * 2) * maxScale)
      return {
        background: [
          `0px / ${minStop}px 100% linear-gradient(${minColor},${minColor}) no-repeat`,
          `${minStop}px / ${maxStop - minStop}px 100% ${gradient} repeat-y`,
          `${minColor} ${maxStop}px / ${width - maxStop}px 100% linear-gradient(${maxColor},${maxColor}) no-repeat`,
        ].join(','),
      }
    }

    const removeNewLayer = () => {
      if (props.activeLayer) {
        removeLayer(props.menuItems.length)
      }
    }

    const renderItem = (item: any, itemIndex: number) => {
      const { mode } = props

      // @ts-ignore TS2604
      const candidateMolecules = (annotation) => (
        <CandidateMoleculesPopover
          placement="right"
          limit={10}
          possibleCompounds={annotation.possibleCompounds}
          isomers={annotation.isomers}
          isobars={annotation.isobars}
        >
          <MolecularFormula class="truncate font-medium h-6 text-sm" ion={annotation.ion} />
        </CandidateMoleculesPopover>
      )

      return (
        <div class="relative">
          <div
            id="intensity-controller"
            class={'sm-menu-items flex flex-col justify-center p-2 relative'}
            style={{
              border: props.mode === 'MULTI' ? '' : 'none',
              outline: props.mode === 'MULTI' ? '' : 'none',
              paddingBottom: props.mode === 'MULTI' ? '' : '2px',
            }}
            onClick={removeNewLayer}
          >
            <div class="menu-item">
              {mode === 'MULTI' && (
                <p class="flex justify-between m-0 items-center flex-wrap">
                  {candidateMolecules(item.annotation)}
                  <ElButton
                    title={item.settings.visible ? 'Hide layer' : 'Show layer'}
                    class="button-reset h-5"
                    onClick={() => {
                      handleToggleVisibility(itemIndex)
                    }}
                  >
                    {item.settings.visible && <VisibleIcon class="fill-current w-4 h-4 text-gray-800" />}
                    {!item.settings.visible && <HiddenIcon class="fill-current w-4 h-4 text-gray-600" />}
                  </ElButton>
                </p>
              )}
              <div ref={(el) => setRef(el, itemIndex)} class="h-9 relative w-full text-center">
                {mode === 'MULTI' && item.isEmpty && <span class="text-base no-data-text">No data</span>}
                {state.refsLoaded && !item.isEmpty && (
                  <RangeSlider
                    // class="ds-comparison-opacity-item"
                    value={item.userScaling}
                    min={0}
                    max={1}
                    step={0.01}
                    style={buildRangeSliderStyle(item, itemIndex)}
                    onInput={(nextRange: number[]) => handleScalingChange(nextRange, itemIndex)}
                  />
                )}
                {item.intensity && !item.isEmpty && (
                  <div class="ds-intensities-wrapper">
                    <IonIntensity
                      intensities={item.intensity?.min}
                      label="Minimum intensity"
                      placeholder="min."
                      onInput={(value: number) => handleIonIntensityChange(value, itemIndex, 'min')}
                      onLock={(value: number) => handleIonIntensityLockChange(value, itemIndex, 'min')}
                    />
                    <ElPopover
                      ref={popover}
                      class="block"
                      placement="bottom"
                      trigger="hover"
                      disabled={!props.showClippingNotice || mode === 'MULTI'}
                      popper-class="w-full max-w-measure-1 text-left text-sm leading-5"
                      v-slots={{
                        reference: () => (
                          <IonIntensity
                            intensities={item.intensity?.max}
                            label="Maximum intensity"
                            placeholder="max."
                            onHidePopover={() => {
                              if (popover.value && typeof popover.value.doClose === 'function') {
                                popover.value.doClose()
                              }
                            }}
                            onInput={(value: number) => handleIonIntensityChange(value, itemIndex, 'max')}
                            onLock={(value: number) => handleIonIntensityLockChange(value, itemIndex, 'max')}
                          />
                        ),
                        default: () => (
                          <ClippingNotice
                            type="hotspot-removal"
                            isNormalized={props.isNormalized}
                            intensity={item.intensity}
                          />
                        ),
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            {mode === 'MULTI' && (
              <ChannelSelector
                class="h-0 absolute bottom-0 left-0 right-0 flex justify-center items-end"
                value={item.settings.channel}
                onRemove={() => removeLayer(itemIndex)}
                onInput={(value: any) => changeLayerColor(value, itemIndex)}
              />
            )}
          </div>
        </div>
      )
    }

    return () => {
      const { activeLayer, menuItems, mode } = props

      return (
        <div
          class="multi-channel-ctrl-wrapper"
          style={{
            paddingBottom: mode === 'MULTI' ? '' : 0,
            paddingTop: mode === 'MULTI' ? '' : 0,
          }}
        >
          {menuItems.map((item: any, itemIndex: number) => renderItem(item, itemIndex))}
          {mode === 'MULTI' && (
            <ElButton
              class={'button-reset p-3 h-12 w-full cursor-default text-gray-700 text-center m-0'}
              onClick={() => {
                if (activeLayer) {
                  removeNewLayer()
                } else {
                  emit('addLayer')
                }
              }}
            >
              <FadeTransition className="text-xs tracking-wide font-medium text-inherit">
                {activeLayer && <span key="active">Select annotation</span>}
                {!activeLayer && (
                  <span key="inactive" class="flex items-center justify-center">
                    Add ion image
                  </span>
                )}
              </FadeTransition>
            </ElButton>
          )}
        </div>
      )
    }
  },
})
