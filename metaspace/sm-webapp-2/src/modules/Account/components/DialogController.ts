import { defineComponent, h, onMounted, computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { DialogType } from '../dialogs'
import { AccountState } from '../store/account'
import SignInDialog from './SignInDialog.vue'
import CreateAccountDialog from './CreateAccountDialog.vue'
import ForgotPasswordDialog from './ForgotPasswordDialog.vue'

const dialogComponents: Record<DialogType, any> = {
  signIn: SignInDialog,
  createAccount: CreateAccountDialog,
  forgotPassword: ForgotPasswordDialog,
}

export default defineComponent({
  setup() {
    const store = useStore()
    const router = useRouter()

    const accountState = computed(() => store.state.account as AccountState)

    onMounted(() => {
      setTimeout(() => {
        const matchedRoute = router.currentRoute.value.matched[0]
        const dialog = matchedRoute ? matchedRoute.meta.dialogType : null
        if (dialog) {
          store.commit('account/showDialog', { dialog, dialogCloseRedirect: '/' })
        }
      }, 1000)
    })

    return () => {
      const dialog = accountState.value.dialog
      const DialogComponent = dialog == null ? null : dialogComponents[dialog]
      return DialogComponent == null ? null : h(DialogComponent)
    }
  },
})
