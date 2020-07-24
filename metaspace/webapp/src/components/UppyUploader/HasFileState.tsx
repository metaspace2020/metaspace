import { defineComponent } from '@vue/composition-api'

import '../../components/ColourIcon.css'
import FileIcon from '../../assets/inline/refactoring-ui/document.svg'
import FadeTransition from '../../components/FadeTransition'
import ProgressRing from '../../components/ProgressRing'

interface Props {
  status: 'UPLOADING' | 'COMPLETE' | 'ERROR' | 'DISABLED'
  fileName: string
  progress: number
  buttonClickHandler?: () => void
}

export default defineComponent<Props>({
  props: {
    status: String,
    fileName: String,
    progress: Number,
    buttonClickHandler: Function,
  },
  setup(props) {
    return () => {
      const fileAction =
        (props.status === 'COMPLETE' || props.status === 'ERROR') ? (
          <button
            key={props.status}
            class="button-reset text-gray-600 hover:text-primary focus:text-primary"
            title={props.status === 'COMPLETE' ? 'Remove file' : 'Retry file'}
            onClick={props.buttonClickHandler}
          >
            <i
              class={[
                'text-inherit text-lg',
                props.status === 'COMPLETE' ? 'el-icon-error' : 'el-icon-refresh',
              ]}
            />
          </button>
        ) : null

      let statusText = null

      switch (props.status) {
        case 'UPLOADING':
        case 'COMPLETE':
          statusText = <p key="progress">{props.progress}%</p>
          break
        case 'ERROR':
          statusText = (
            <p key="error" class="font-medium text-danger">
              Upload failed
            </p>
          )
      }

      return (
        <div class={['text-sm leading-5 transition-opacity duration-300', props.status === 'DISABLED' && 'opacity-50']}>
          <div class="relative mt-3">
            <FileIcon class="sm-colour-icon sm-colour-icon--large" />
            <ProgressRing
              class={[
                'absolute top-0 left-0',
                {
                  'text-success': props.status === 'COMPLETE',
                  'text-primary': props.status === 'UPLOADING',
                  'text-danger': props.status === 'ERROR',
                },
              ]}
              radius={24}
              stroke={4}
              progress={props.progress}
            />
            <FadeTransition class="absolute top-0 right-0 -mt-3 -mr-6">
              {fileAction}
            </FadeTransition>
          </div>
          <p class="m-0 mt-3 font-medium">
            {props.fileName}
          </p>
          <FadeTransition class="m-0">
            {statusText}
          </FadeTransition>
        </div>
      )
    }
  },
})
