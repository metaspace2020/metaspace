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
import PopupAnchor from '../../NewFeaturePopup/PopupAnchor.vue'
import { TuneSvg } from '../../../design/refactoringUIIcons'

const RouterLink = Vue.component('router-link')
const saveSettings = gql`mutation saveImageViewerSnapshotMutation($input: ImageViewerSnapshotInput!) {
  saveImageViewerSnapshot(input: $input)
}`

interface DatasetComparisonModeButtonProps {
  isActive: boolean
}

interface DatasetComparisonModeButtonState {
  mode: string
}

export const DatasetComparisonModeButton = defineComponent<DatasetComparisonModeButtonProps>({
  name: 'DatasetComparisonModeButton',
  props: {
    isActive: { type: Boolean, required: false, default: false },
  },
  setup(props, { emit }) {
    const state = reactive<DatasetComparisonModeButtonState>({
      mode: props.isActive ? 'MULTI' : 'SINGLE',
    })

    const handleClick = async() => {
      state.mode = state.mode === 'MULTI' ? 'SINGLE' : 'MULTI'
      emit('mode', state.mode)
    }

    return () => {
      const { mode } = state
      const isMulti = mode === 'MULTI'

      return (
        <Button
          title={`${isMulti ? 'Disable' : 'Enable'} ion image channels`}
          class={`button-reset h-9 rounded-lg flex items-center justify-center px-2 hover:bg-gray-100 ${isMulti
            ? 'text-blue-700' : ''}`}
          onClick={handleClick}>
          <PopupAnchor
            featureKey="multipleIonImages"
            placement="bottom"
            showUntil={new Date('2022-03-01')}
            class="flex items-center"
          >
            <StatefulIcon
              class="h-6 w-6"
              active={isMulti}
            >
              <TuneSvg />
            </StatefulIcon>
            <span class="leading-none ml-1">Channels</span>
          </PopupAnchor>
        </Button>
      )
    }
  },
})
