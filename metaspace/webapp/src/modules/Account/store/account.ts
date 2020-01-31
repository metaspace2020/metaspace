import { Module } from 'vuex'
import { DialogType } from '../dialogs'
import router from '../../../router'
import { RawLocation } from 'vue-router/types/router'

export interface AccountState {
  dialog: DialogType | null;
  dialogCloseRedirect: RawLocation | null;
  loginSuccessRedirect: RawLocation | null;
}

interface ShowDialogOptions {
  dialog: DialogType;
  dialogCloseRedirect?: RawLocation;
  loginSuccessRedirect?: RawLocation;
}

interface HideDialogOptions {
  dialog: DialogType;
  isLoginSuccess?: boolean;
}

const account: Module<AccountState, any> = {
  namespaced: true,
  state: {
    dialog: null,
    dialogCloseRedirect: null,
    loginSuccessRedirect: null,
  },
  mutations: {
    showDialog(state, payload: DialogType | ShowDialogOptions) {
      const options: ShowDialogOptions = typeof payload === 'string' ? { dialog: payload } : payload

      state.dialog = options.dialog
      if (options.dialogCloseRedirect != null) {
        state.dialogCloseRedirect = options.dialogCloseRedirect
      }
      if (options.loginSuccessRedirect != null) {
        state.loginSuccessRedirect = options.loginSuccessRedirect
      }
    },
    hideDialog(state, payload: DialogType | HideDialogOptions) {
      const options: HideDialogOptions = typeof payload === 'string' ? { dialog: payload } : payload

      if (state.dialog === options.dialog) {
        state.dialog = null
        if (options.isLoginSuccess && state.loginSuccessRedirect != null) {
          router.push(state.loginSuccessRedirect)
        } else if (state.dialogCloseRedirect != null) {
          router.push(state.dialogCloseRedirect)
        }

        state.dialogCloseRedirect = null
        state.loginSuccessRedirect = null
      }
    },
  },
}

export default account
