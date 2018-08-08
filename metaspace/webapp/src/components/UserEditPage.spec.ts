import { mount, Wrapper } from '@vue/test-utils';
import ElementUI from 'element-ui';
import Vue from 'vue';
import registerMockComponent from '../../tests/utils/registerMockComponent';
import { restoreConsole, suppressConsoleWarn } from '../../tests/utils/suppressConsole';
import UserEditPage from './UserEditPage.vue';

Vue.use(ElementUI);
registerMockComponent('el-dialog'); // ElDialogs mount their content somewhere else in the DOM. Mock it out so that the snapshot includes the content.
registerMockComponent('el-input'); //

const setFormField = (wrapper: Wrapper<Vue>, fieldName: string, value: string) => {
  wrapper
    .findAll(ElementUI.FormItem)
    .filter((fi: Wrapper<ElementUI.FormItem>) => fi.props().prop === fieldName)
    .at(0)
    .find('input')
    .setValue(value);
};

describe('UserEditPage', () => {
  beforeEach(() => {
    suppressConsoleWarn('async-validator:');
  });

  afterEach(async () => {
    // await Vue.nextTick();
    restoreConsole();
  });


  it('should match snapshot', async () => {
    const wrapper = mount(UserEditPage, { sync: false });
    wrapper.setData({
      currentUser: {
        id: '22333',
        name: 'foo',
        role: 'user'
      },
      name: 'foo',
      email: 'bar'
    });
    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
    //TODO Lachlan: Check why the Input can't be found
    // console.log(wrapper.find('.fullname').html())
    // const fullname = wrapper.find('.fullname').find(ElementUI.Input);
    // expect(fullname.props().value).toBe('foo')
  });

});
