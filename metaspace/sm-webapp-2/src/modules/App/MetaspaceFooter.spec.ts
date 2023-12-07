import { nextTick } from 'vue';
import router from "../../router";
import store from "../../store";
import { mount} from '@vue/test-utils';
import MetaspaceFooter from './MetaspaceFooter.vue'
import {expect} from "vitest";


describe('MetaspaceFooter', () => {
  it('should match snapshot', async() => {
    const wrapper = mount(MetaspaceFooter, { store, router })
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })
})
