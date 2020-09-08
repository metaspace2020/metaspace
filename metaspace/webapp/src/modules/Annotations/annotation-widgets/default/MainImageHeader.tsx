import { defineComponent, watch } from '@vue/composition-api'

import FadeTransition from '../../../../components/FadeTransition'
import { MenuButtons, menuState } from '../../../ImageViewer'

const MainImageHeader = defineComponent({
  name: 'MainImageHeader',
  props: {
    isActive: Boolean,
  },
  setup(props) {
    watch(() => props.isActive, () => {
      if (props.isActive === false) {
        menuState.value = 'NONE'
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
