import { Module } from 'vuex';
import { DialogType } from '../dialogs';
import router from '../../../router';

export interface AccountState {
  dialog: DialogType | null;
  showDialogAsPage: boolean;
}

const account = {
  namespaced: true,
  state: {
    dialog: null,
    showDialogAsPage: false
  },
  mutations: {
    showDialog(state: AccountState, dialog: DialogType) {
      state.dialog = dialog;
      state.showDialogAsPage = false;
    },
    showDialogAsPage(state: AccountState, dialog: DialogType) {
      state.dialog = dialog;
      state.showDialogAsPage = true;
    },
    hideDialog(state: AccountState, dialog: DialogType) {
      if (state.dialog === dialog) {
        state.dialog = null;
        if (state.showDialogAsPage) {
          router.push('/');
        }
      }
    }
  }
};

export default account as Module<AccountState, any>;
