import { createComponent, reactive } from '@vue/composition-api'

import cookiejar from './cookies'
import CloseIcon from '../../assets/refactoring-ui/close-circle.svg?inline'

const cookie = 'cookiebanner-accepted'

export default createComponent({
  setup() {
    const state = reactive({
      agreed: cookiejar.has(cookie),
    })

    const agree = () => {
      cookiejar.set({ key: cookie })
      state.agreed = true
    }

    return () => (
      state.agreed
        ? null
        : <div class="fixed bottom-0 left-0 right-0 bg-body text-white leading-6 py-1 text-sm" style="z-index: 999">
          <button class="button-reset float-right cursor-pointer mx-1 h-6" onClick={agree}>
            <CloseIcon class="h-6 w-6 text-blue-100" />
          </button>
          <p class="m-0 text-center px-2">
            We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies.
            {' '}<router-link to="/privacy#cookies" class="text-blue-300">Learn more</router-link>
          </p>
        </div>
    )
  },
})
