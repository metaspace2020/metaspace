import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PpmHelp from './PpmHelp.vue'
import router from "../../../router";
import store from "../../../store";

describe('PpmHelp', () => {
  it('should match snapshot', async () => {
    const wrapper = mount(PpmHelp, {
      global: {
        plugins: [store, router]
      }
    });

    await nextTick();
    expect(wrapper.html()).toMatchSnapshot();
  });
});
