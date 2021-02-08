import { defineComponent, reactive } from '@vue/composition-api'
import { get, set } from 'js-cookie'

import CloseIcon from '../../assets/inline/refactoring-ui/icon-close.svg'

const cookieKey = 'cookiebanner-accepted'
const cookieValue = '1'

export default defineComponent({
  setup() {
    const state = reactive({
      agreed: get(cookieKey) === cookieValue,
    })

    const agree = () => {
      set(cookieKey, cookieValue)
      state.agreed = true
    }

    return () => (
      state.agreed
        ? null
        : <div class="fixed bottom-0 left-0 right-0 bg-body text-white leading-6 py-1 text-sm" style="z-index: 999">
          <button class="button-reset float-right cursor-pointer mx-1 h-6" onClick={agree} title="Agree and close">
            <CloseIcon class="h-6 w-6 fill-current text-blue-100" />
          </button>
          <p class="m-0 text-center px-2">
            We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies.
            {' '}<router-link to="/privacy#cookies" class="text-blue-300">Learn more</router-link>
          </p>
        </div>
    )
  },
})
