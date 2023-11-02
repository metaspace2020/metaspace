import { defineComponent, h } from 'vue';

export default defineComponent({
  name: 'popup-anchor',
  functional: true,
  setup(props, { slots }) {
    return () => slots.default ? slots.default()[0] : null;
  },
});
