import { mount } from '@vue/test-utils'
import router from '../../router'
import store from '../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import { DatasetsDialog } from './DatasetsDialog'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'

Vue.use(Vuex)
sync(store, router)

describe('DatasetsDialog', () => {
  const propsData = {
    project: {
      id: '05c6519a-8049-11eb-927e-6bf28a9b25ae',
      name: 'Test',
      currentUserRole: 'MANAGER',
    },
    currentUser: {
      id: '039801c8-919e-11eb-908e-3b2b8e672707',
      groups: [
        {
          group: {
            id: 'testGroup',
            label: 'group1',
          },
        },
      ],
    },
    visible: true,
    isManager: true,
    refreshData: () => {},
  }

  const testHarness = Vue.extend({
    components: {
      DatasetsDialog,
    },
    render(h) {
      return h(DatasetsDialog, { props: this.$attrs })
    },
  })

  const graphqlWithData = () => {
    initMockGraphqlClient({
      Query: () => ({
        allDatasets: () => {
          return [{
            id: '2021-03-31_11h02m28s',
            name: 'New 3 (1)',
            uploadDT: '2021-03-31T14:02:28.722Z',
          }, {
            id: '2021-03-30_18h25m18s',
            name: 'Untreated_3_434_super_lite_19_31 (1)',
            uploadDT: '2021-03-30T21:25:18.473Z',
          }]
        },
      }),
    })
  }
  const graphqlWithExtraUserData = () => {
    initMockGraphqlClient({
      Query: () => ({
        allDatasets: (src: any, { filter: { project } } : any) => {
          if (project) {
            return []
          }

          return [{
            id: '2021-03-31_11h02m28s',
            name: 'New 3 (1)',
            uploadDT: '2021-03-31T14:02:28.722Z',
          }, {
            id: '2021-03-30_18h25m18s',
            name: 'Untreated_3_434_super_lite_19_31 (1)',
            uploadDT: '2021-03-30T21:25:18.473Z',
          }]
        },
      }),
    })
  }

  const graphqlWithNoData = () => {
    initMockGraphqlClient({
      Query: () => ({
        allDatasets: () => {
          return []
        },
      }),
    })
  }

  // it('it should match snapshot', async() => {
  //   graphqlWithData()
  //   const wrapper = mount(testHarness, { store, router, apolloProvider, propsData })
  //   await Vue.nextTick()
  //
  //   expect(wrapper).toMatchSnapshot()
  // })
  //
  // it('it should match no dataset snapshot', async() => {
  //   graphqlWithNoData()
  //   const wrapper = mount(testHarness, { store, router, apolloProvider, propsData })
  //   await Vue.nextTick()
  //
  //   expect(wrapper).toMatchSnapshot()
  // })

  it('it should have disabled update button when no data available', async() => {
    graphqlWithNoData()
    const wrapper = mount(testHarness, { store, router, apolloProvider, propsData })
    await Vue.nextTick()

    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(true)
  })

  it('it should have disabled update button when no dataset selection has changed', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, apolloProvider, propsData })
    await Vue.nextTick()

    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(true)
  })
})
