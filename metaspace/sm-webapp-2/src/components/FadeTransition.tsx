import { defineComponent, h } from 'vue';

export default defineComponent({
  name: 'FadeTransition',
  setup(props, { slots }) {
    return () => h(
      'transition',
      {
        mode: "out-in",
        enterClass: "opacity-0",
        leaveToClass: "opacity-0",
        enterActiveClass: "duration-150 transition-opacity ease-in-out",
        leaveActiveClass: "duration-150 transition-opacity ease-in-out"
      },
      slots.default ? slots.default() : []
    );
  },
});
