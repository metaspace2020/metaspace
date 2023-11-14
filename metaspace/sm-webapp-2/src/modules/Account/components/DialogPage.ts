import { defineComponent, watch, onMounted, PropType } from 'vue';
import { DialogType } from '../dialogs';
import { useStore } from 'vuex';

export default defineComponent({
  props: {
    dialog: {
      type: String as PropType<DialogType>,
      required: true
    }
  },
  setup(props) {
    const store = useStore();

    const showDialog = () => {
      store.commit('account/showDialog', {
        dialog: props.dialog,
        dialogCloseRedirect: '/',
      });
    };

    // Watcher
    watch(() => props.dialog, showDialog);

    // Created Lifecycle Hook
    onMounted(showDialog);

    return () => null; // Render function
  }
});
