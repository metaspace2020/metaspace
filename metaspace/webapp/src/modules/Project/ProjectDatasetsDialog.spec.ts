import { mount } from '@vue/test-utils'
import router from '../../router'
import store from '../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import { ProjectDatasetsDialog } from './ProjectDatasetsDialog'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'

Vue.use(Vuex)
sync(store, router)

describe('ProjectDatasetsDialog', () => {
  const propsData = {
    project: {
      id: '05c6519a-8049-11eb-927e-6bf28a9b25ae',
      name: 'Test',
      currentUserRole: 'MANAGER',
    },
    currentUserId: '039801c8-919e-11eb-908e-3b2b8e672707',
    dialogLabel: 'Would you like to include/remove previously submitted datasets?',
    saveBtnLabel: 'Update',
    cancelBtnLabel: 'Cancel',
    selectAllLabel: 'Select all',
    selectNoneLabel: 'Select none',
    noDatasetsLabel: 'No datasets available',
    visible: true,
    isAdmin: true,
    refreshData: () => {},
    projectDatasets: [
      {
        id: '2021-03-31_11h02m28s',
        name: 'New 3 (1)',
        status: 'FINISHED',
        canDownload: true,
        uploadDT: '2021-03-31T14:02:28.722Z',
      },
      {
        id: '2021-03-30_18h25m18s',
        name: 'Untreated_3_434_super_lite_19_31 (1)',
        status: 'FINISHED',
        statusUpdateDT: '2021-03-30T21:29:02.043Z',
        uploadDT: '2021-03-30T21:25:18.473Z',
      },
    ],
  }
  const propsDataNoDsSelected = {
    project: {
      id: '05c6519a-8049-11eb-927e-6bf28a9b25ae',
      name: 'Test',
      currentUserRole: 'MANAGER',
    },
    currentUserId: '039801c8-919e-11eb-908e-3b2b8e672707',
    dialogLabel: 'Would you like to include/remove previously submitted datasets?',
    saveBtnLabel: 'Update',
    cancelBtnLabel: 'Cancel',
    selectAllLabel: 'Select all',
    selectNoneLabel: 'Select none',
    noDatasetsLabel: 'No datasets available',
    visible: true,
    isAdmin: true,
    refreshData: () => {},
    projectDatasets: [],
  }

  const testHarness = Vue.extend({
    components: {
      ProjectDatasetsDialog,
    },
    render(h) {
      return h(ProjectDatasetsDialog, { props: this.$attrs })
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
            __typename: 'Dataset',
          }, {
            id: '2021-03-30_18h25m18s',
            name: 'Untreated_3_434_super_lite_19_31 (1)',
            uploadDT: '2021-03-30T21:25:18.473Z',
            __typename: 'Dataset',
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

  it('it should match snapshot', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should match no dataset snapshot', async() => {
    graphqlWithNoData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should have disabled update button when no data available', async() => {
    graphqlWithNoData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(true)
  })

  it('it should have disabled update button when no dataset selection has changed', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(true)
  })

  it('it should uncheck all datasets when clicking select none', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    const selectNone = wrapper.findAll('.select-link').at(0)
    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(true)
    selectNone.trigger('click')
    await Vue.nextTick()

    wrapper.findAll('.el-checkbox').wrappers.forEach((checkBox) => {
      expect(checkBox.classes('is-checked')).toBe(false)
    })

    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(false)
  })

  it('it should check all datasets when clicking select all', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    const selectAll = wrapper.findAll('.select-link').at(1)
    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(true)
    selectAll.trigger('click')
    await Vue.nextTick()

    wrapper.findAll('.el-checkbox').wrappers.forEach((checkBox) => {
      expect(checkBox.classes('is-checked')).toBe(true)
    })

    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(false)
  })

  it('it should check all datasets when clicking select all', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    const selectAll = wrapper.findAll('.select-link').at(1)
    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(true)
    selectAll.trigger('click')
    await Vue.nextTick()

    wrapper.findAll('.el-checkbox').wrappers.forEach((checkBox) => {
      expect(checkBox.classes('is-checked')).toBe(true)
    })

    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(false)
  })

  it('it should check one dataset and hit update', async() => {
    graphqlWithData()

    const wrapper = mount(testHarness, {
      store,
      router,
      propsData: {
        ...propsDataNoDsSelected,
      },
    })
    await Vue.nextTick()

    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(true)

    wrapper.findAll('.el-checkbox').wrappers.forEach((checkBox) => {
      expect(checkBox.classes('is-checked')).toBe(false)
    })

    wrapper.findAll('.el-checkbox').at(0).trigger('click')
    await Vue.nextTick()

    expect(wrapper.findAll('.el-checkbox').at(0).classes('is-checked')).toBe(true)
    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(false)
  })

  it('it should uncheck one dataset and hit update', async() => {
    graphqlWithData()

    const wrapper = mount(testHarness, {
      store,
      router,
      propsData,
    })
    await Vue.nextTick()

    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(true)

    wrapper.findAll('.el-checkbox').wrappers.forEach((checkBox) => {
      expect(checkBox.classes('is-checked')).toBe(true)
    })

    wrapper.findAll('.el-checkbox').at(0).trigger('click')
    await Vue.nextTick()

    expect(wrapper.findAll('.el-checkbox').at(0).classes('is-checked')).toBe(false)
    expect(wrapper.find('.el-button--primary').props('disabled')).toBe(false)
  })
})
