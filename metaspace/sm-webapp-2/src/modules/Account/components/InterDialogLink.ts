import { defineComponent, computed, h } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useStore } from 'vuex';
import { dialogRoutes } from '../dialogs';

/**
 * This component is needed for a weird pattern in CreateAccountDialog/SignInDialog:
 * * when they display as a dialog over some other page, they should behave like a dialog and any links to other dialogs
 *   should just replace the existing dialog
 * * when they display as a stand-alone page, they should behave like a page and internal links should navigate away
 * In both cases, links should have a `href`
 */
export default defineComponent({
  name: 'InterDialogLink',
  props: {
    dialog: {
      type: String,
      required: true
    }
  },
  setup(props, { slots }) {
    const router = useRouter();
    const route = useRoute();
    const store = useStore();

    const link = computed(() => dialogRoutes[props.dialog]);

    const handleClick = (e: Event) => {
      e.preventDefault();
      if (store.state.account.dialogCloseRedirect != null) {
        router.push(link.value);
      } else {
        store.commit('account/showDialog', props.dialog);
      }
    };

    return () => h('a', {
      href: router.resolve(link.value, route).href,
      onClick: handleClick
    }, slots.default ? slots.default() : []);
  }
});
