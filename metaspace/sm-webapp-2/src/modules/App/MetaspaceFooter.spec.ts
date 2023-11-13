import { nextTick } from 'vue';
import router from "@/router";
import store from "@/store";
import { mount} from '@vue/test-utils';
import MetaspaceFooter from './MetaspaceFooter.vue'


describe('MetaspaceFooter', () => {
  it('should match snapshot', async({expect}) => {
    const wrapper = mount(MetaspaceFooter, { store, router })
    await nextTick()

    expect(wrapper).toMatchSnapshot()
  })
})
