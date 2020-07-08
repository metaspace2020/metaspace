import { createComponent, reactive } from '@vue/composition-api'

import '../../components/ColourIcon.css'
import FileIcon from '../../assets/inline/refactoring-ui/document.svg'
import FadeTransition from '../../components/FadeTransition'
import ProgressRing from '../../components/ProgressRing'

interface State {
  progress: number
}

interface Props {
  status: 'UPLOADING' | 'COMPLETE' | 'ERROR' | 'DISABLED'
  fileName: string
  progress: number
  buttonClickHandler?: () => void
}

export default createComponent<Props>({
  props: {
    status: String,
    fileName: String,
    progress: Number,
    buttonClickHandler: Function,
  },
  setup(props) {
    return () => (
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
            { props.status === 'UPLOADING'
              && <span>{props.progress}%</span> }
            { props.status === 'COMPLETE'
              && <button
                class="button-reset text-gray-600 hover:text-primary focus:text-primary"
                title="Remove file"
                onClick={props.buttonClickHandler}
              >
                <i class="el-icon-error text-inherit text-lg"></i>
              </button> }
            { props.status === 'ERROR'
              && <button
                class="button-reset text-gray-600 hover:text-primary focus:text-primary"
                title="Retry file"
                onClick={props.buttonClickHandler}
              >
                <i class="el-icon-refresh text-inherit text-lg"></i>
              </button> }
          </FadeTransition>
        </div>
        <FadeTransition>
          { props.status === 'ERROR'
            ? <p key="error" class="m-0 mt-3 font-medium text-danger">
              Upload failed
            </p>
            : <p class="m-0 mt-3 font-medium">
              {props.fileName}
            </p> }
        </FadeTransition>
      </div>
    )
  },
})
