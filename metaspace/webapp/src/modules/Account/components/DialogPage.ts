import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { DialogType } from '../dialogs';
import * as config from '../../../clientConfig.json';

@Component
export default class DialogPage extends Vue {
  @Prop({ type: String, required: true })
  dialog!: DialogType;

  render() {
    return null;
  }
  created() {
    if (config.features.newAuth) {
      this.$store.commit('account/showDialogAsPage', this.dialog);
    }
  }
}
