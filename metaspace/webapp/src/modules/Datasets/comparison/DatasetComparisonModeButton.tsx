import { defineComponent, reactive } from 'vue'
import StatefulIcon from '../../../components/StatefulIcon.vue'
import { ElButton } from '../../../lib/element-plus'
import { defineAsyncComponent } from 'vue'
import PopupAnchor from '../../NewFeaturePopup/PopupAnchor.vue'

const TuneSvg = defineAsyncComponent(() => import('../../../assets/inline/refactoring-ui/icon-tune.svg'))

interface DatasetComparisonModeButtonState {
  mode: string
}

export const DatasetComparisonModeButton = defineComponent({
  name: 'DatasetComparisonModeButton',
  props: {
    isActive: { type: Boolean, required: false, default: false },
    onMode: { type: Function, required: false },
  },
  setup(props, { emit }) {
    const state = reactive<DatasetComparisonModeButtonState>({
      mode: props.isActive ? 'MULTI' : 'SINGLE',
    })

    const handleClick = async () => {
      state.mode = state.mode === 'MULTI' ? 'SINGLE' : 'MULTI'
      emit('mode', state.mode)
    }

    return () => {
      const { mode } = state
      const isMulti = mode === 'MULTI'

      return (
        <ElButton
          title={`${isMulti ? 'Disable' : 'Enable'} ion image channels`}
          class={`button-reset h-9 rounded-lg flex items-center justify-center px-2 hover:bg-gray-100 ${
            isMulti ? 'text-blue-700' : ''
          }`}
          onClick={handleClick}
        >
          <PopupAnchor
            featureKey="multipleIonImages"
            placement="bottom"
            showUntil={new Date('2022-03-01')}
            class="flex items-center"
          >
            <StatefulIcon class="h-6 w-6" active={isMulti}>
              <TuneSvg />
            </StatefulIcon>
            <span class="leading-none ml-1">Channels</span>
          </PopupAnchor>
        </ElButton>
      )
    }
  },
})
