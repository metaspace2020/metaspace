import { defineComponent, watch, nextTick, computed, h } from 'vue'
import { useStore } from 'vuex'
import { useRoute } from 'vue-router'
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
  name: 'DialogComponentHandler',
  components: {
    SignInDialog,
    CreateAccountDialog,
    ForgotPasswordDialog,
  },
  setup() {
    const store = useStore()
    const route = useRoute()

    const currentDialog = computed(() => store.state.account as AccountState)

    watch(
      () => route.path,
      async () => {
        await nextTick()
        const matchedRoute: any = route.matched[0]
        const dialog = matchedRoute?.meta?.dialogType as DialogType | null
        if (dialog) {
          store.commit('account/showDialog', { dialog, dialogCloseRedirect: '/' })
        }
      },
      { immediate: true }
    )

    return {
      currentDialog,
    }
  },
  render() {
    const dialog = this.currentDialog.dialog
    console.log('[Test] dialog', dialog)

    const DialogComponent = dialog ? dialogComponents[dialog] : null
    return DialogComponent ? h(DialogComponent) : null
  },
})
