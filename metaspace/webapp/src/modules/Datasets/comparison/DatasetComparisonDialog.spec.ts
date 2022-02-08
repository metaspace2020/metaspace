import { mount } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import { DatasetComparisonDialog } from './DatasetComparisonDialog'
import { initMockGraphqlClient, apolloProvider } from '../../../../tests/utils/mockGraphqlClient'

describe('DatasetComparisonDialog', () => {
  const propsData = {
    selectedDatasetIds: [
      '2021-03-31_11h01m28s',
      '2021-03-30_18h22m18s',
      '2021-04-06_08h33m04s',
    ],
  }

  const manySelectedPropsData = {
    selectedDatasetIds: [
      '2021-03-31_11h01m28s',
      '2021-03-30_18h22m18s',
      '2021-04-06_08h33m04s',
      '2021-03-30_18h23m18s',
      '2021-04-06_08h34m04s',
    ],
  }

  const propsDataUnique = {
    selectedDatasetIds: [
      '2021-03-31_11h02m28s',
    ],
  }

  const graphqlReturnData = [{
    id: '2021-03-31_11h01m28s',
    name: 'Mock (1)',
    uploadDT: '2021-03-31T14:02:28.722Z',
  }, {
    id: '2021-03-30_18h22m18s',
    name: 'Mock (2)',
    uploadDT: '2021-03-30T21:25:18.473Z',
  }, {
    id: '2021-04-06_08h33m04s',
    name: 'Mock (3)',
    uploadDT: '2021-03-30T21:25:18.473Z',
  }, {
    id: '2021-03-30_18h23m18s',
    name: 'Mock (4)',
    uploadDT: '2021-03-30T21:25:18.473Z',
  }, {
    id: '2021-04-06_08h34m04s',
    name: 'Mock (5)',
    uploadDT: '2021-03-30T21:25:18.473Z',
  }]

  const mockAnnotationAgg = jest.fn((src: any, args: any, ctx: any) => ({
    saveImageViewerSnapshot: 'saveImageViewerSnapshot',
  }))

  const testHarness = Vue.extend({
    components: {
      DatasetComparisonDialog,
    },
    render(h) {
      return h(DatasetComparisonDialog, { props: this.$attrs })
    },
  })

  const graphqlWithData = () => {
    initMockGraphqlClient({
      Query: () => ({
        allDatasets: () => {
          return graphqlReturnData
        },
      }),
      Mutation: () => ({
        saveImageViewerSnapshot: mockAnnotationAgg,
      }),
    })
  }

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
    graphqlWithData()
  })

  it('it should match snapshot', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should display the minimum required datasets error', async() => {
    const wrapper = mount(testHarness, { store, router, propsData: propsDataUnique })
    await Vue.nextTick()
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    expect(wrapper.find('.text-danger').element.style.visibility).not.toBe('hidden')
    expect(wrapper.find('.text-danger').text())
      .toBe('Please select at least two datasets to be compared!')
  })

  it('it should select a dataset and advance to the next step', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    expect(wrapper.find('.text-danger').element.style.visibility).toBe('hidden')
    expect(wrapper.findAll('.sm-workflow-step').at(1).classes()
      .includes('active')).toBe(true)
  })

  it('it should check the ds comparison grid n of cols and rows', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    // advances first step
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    expect(wrapper.findAll('.dataset-comparison-dialog-row').length).toBe(2)
    expect(wrapper.findAll('.dataset-comparison-dialog-col').length).toBe(4)
  })

  it('it should display the final min grid size error', async() => {
    const wrapper = mount(testHarness, { store, router, propsData: manySelectedPropsData })
    await Vue.nextTick()

    // advances first step
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    expect(wrapper.find('.text-danger').element.style.visibility).not.toBe('hidden')
    expect(wrapper.find('.text-danger').text())
      .toBe('The grid must have enough cells to all datasets!')
  })

  it('it should display the final step required error', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    // advances first and second step and tries to compare
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    expect(wrapper.find('.text-danger').element.style.visibility).not.toBe('hidden')
    expect(wrapper.find('.text-danger').text())
      .toBe('Please place all the selected datasets on the grid!')
  })

  it('it should set ds placement on the grid and advance to comparison page', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    // advances first and second step
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    // place datasets
    wrapper.findAll('.dataset-cell').at(0).trigger('click')
    wrapper.findAll('.el-select-dropdown__item').at(0).trigger('click')
    await Vue.nextTick()
    await new Promise((resolve) => setTimeout(resolve, 500))

    wrapper.findAll('.dataset-cell').at(1).trigger('click')
    wrapper.findAll('.el-select-dropdown__item').at(4).trigger('click')
    await Vue.nextTick()
    await new Promise((resolve) => setTimeout(resolve, 500))

    wrapper.findAll('.dataset-cell').at(1).trigger('click')
    wrapper.findAll('.el-select-dropdown__item').at(8).trigger('click')
    await Vue.nextTick()
    await new Promise((resolve) => setTimeout(resolve, 500))

    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    expect(wrapper.find('.text-danger').element.style.visibility).toBe('hidden')
    expect(mockAnnotationAgg).toHaveBeenCalledTimes(1)
    await Vue.nextTick()

    // check if the user was redirect to the page with the correct params
    expect(wrapper.vm.$route.name).toBe('datasets-comparison')
    expect(wrapper.vm.$route.query.viewId).toBe('saveImageViewerSnapshot')
    expect(wrapper.vm.$route.params.dataset_id).toBe(propsData.selectedDatasetIds[0])
  })
})
