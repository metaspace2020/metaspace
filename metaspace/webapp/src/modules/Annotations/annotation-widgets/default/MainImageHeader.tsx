import { defineComponent, watch } from '@vue/composition-api'

import FadeTransition from '../../../../components/FadeTransition'
import MenuButtons from '../MenuButtons'

import { useMachine } from '../../../../lib/fsm'

const MainImageHeader = defineComponent({
  name: 'MainImageHeader',
  props: {
    isActive: Boolean,
  },
  setup(props) {
    const { dispatch } = useMachine('menu')

    watch(() => props.isActive, () => {
      if (props.isActive === false) {
        dispatch({ type: 'NONE' })
      }
    })

    return () => (
      <span
        slot="title"
        class="w-full"
      >
        <span>
          Image viewer
        </span>
        <FadeTransition>
          { props.isActive && <MenuButtons class="ml-auto" /> }
        </FadeTransition>
      </span>
    )
  },
})

export default MainImageHeader
