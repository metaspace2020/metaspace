import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, h } from 'vue'
import { RequestedAccessDialog } from './RequestedAccessDialog'
import router from '../../router'
import store from '../../store'

describe('RequestedAccessDialog', () => {
  const propsData = {
    group: {
      id: '7871c940-8198-11eb-8245-9b435184cf72',
      name: 'TEST_GROUP',
      shortName: 'TG',
      urlSlug: 'tgroup',
      currentUserRole: 'PENDING',
      members: [
        {
          role: 'GROUP_ADMIN',
          numDatasets: 2,
          user: {
            id: '039801c8-919e-11eb-908e-3b2b8e672707',
            name: 'John Doe',
            email: 'jdoe@mail.com',
          },
        },
        {
          role: 'GROUP_ADMIN',
          numDatasets: 2,
          user: {
            id: '039801c8-919e-11eb-908e-3b2b8e672701',
            name: 'John Doe 2',
            email: 'jdoe2@mail.com',
          },
        },
        {
          role: 'GROUP_ADMIN',
          numDatasets: 2,
          user: {
            id: '039801c8-919e-11eb-908e-3b2b8e672702',
            name: 'John Doe 3',
            email: 'jdoe3@mail.com',
          },
        },
      ],
    },
    visible: true,
  }

  const testHarness = defineComponent({
    components: {
      RequestedAccessDialog,
    },
    props: ['group', 'visible', 'dsSubmission'],
    setup(props) {
      return () => h(RequestedAccessDialog, { ...props })
    },
  })

  it('it should match snapshot', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
      },
      props: propsData,
    })
    await nextTick()
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('it should match dataset processing snapshot', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
      },
      props: {
        ...propsData,
        dsSubmission: true,
      },
    })
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })
})
