import { mount, Wrapper } from '@vue/test-utils';
import ElementUI from 'element-ui';
import Vue from 'vue';
import registerMockComponent from '../../tests/utils/registerMockComponent';
import { restoreConsole, suppressConsoleWarn } from '../../tests/utils/suppressConsole';
import UserEditPage from './UserEditPage.vue';

Vue.use(ElementUI);
registerMockComponent('el-dialog'); // ElDialogs mount their content somewhere else in the DOM. Mock it out so that the snapshot includes the content.

describe('UserEditPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    suppressConsoleWarn('async-validator:');
  });

  afterEach(async () => {
    jest.useRealTimers();
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
      model: {
        name: 'foo',
        email: 'bar'
      }
    });
    await Vue.nextTick();
    jest.runAllTimers();

    expect(wrapper).toMatchSnapshot();
  });

});
