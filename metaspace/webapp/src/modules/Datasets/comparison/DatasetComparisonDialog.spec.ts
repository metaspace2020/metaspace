import { mount } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import { DatasetComparisonDialog } from './DatasetComparisonDialog'
import { initMockGraphqlClient, apolloProvider } from '../../../../tests/utils/mockGraphqlClient'

Vue.use(Vuex)
sync(store, router)

describe('DatasetComparisonDialog', () => {
  const propsData = {
    selectedDatasetIds: [
      '2021-04-06_08h35m04s',
    ],
  }

  const graphqlReturnData = [{
    id: '2021-03-31_11h02m28s',
    name: 'New 3 (1)',
    uploadDT: '2021-03-31T14:02:28.722Z',
  }, {
    id: '2021-03-30_18h25m18s',
    name: 'Untreated_3_434_super_lite_19_31 (1)',
    uploadDT: '2021-03-30T21:25:18.473Z',
  }, {
    id: '2021-04-06_08h35m04s',
    name: 'Untreated_3_434_super_lite_19_31 (1)',
    uploadDT: '2021-03-30T21:25:18.473Z',
  }]

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
    })
  }

  it('it should match snapshot', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should display the minimum required datasets error', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    expect(wrapper.find('.text-danger').exists()).toBe(true)
    expect(wrapper.find('.text-danger').text())
      .toBe('Please select at least two datasets to be compared!')
  })

  it('it should select a dataset and advance to the next step', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    wrapper.find('.el-select').trigger('click')
    wrapper.find('.el-select-dropdown__item').trigger('click')
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    expect(wrapper.find('.text-danger').exists()).toBe(false)
    expect(wrapper.findAll('.sm-workflow-step').at(1).classes()
      .includes('active')).toBe(true)
  })

  it('it should check the ds comparison grid nofcols and rows', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    // advances first step
    wrapper.find('.el-select').trigger('click')
    wrapper.find('.el-select-dropdown__item').trigger('click')
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    expect(wrapper.findAll('.dataset-comparison-dialog-row').length).toBe(2)
    expect(wrapper.findAll('.dataset-comparison-dialog-col').length).toBe(4)
  })

  it('it should display the final step required error', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    // advances first and second step and tries to compare
    wrapper.find('.el-select').trigger('click')
    wrapper.find('.el-select-dropdown__item').trigger('click')
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()
    wrapper.find('.el-button--primary').trigger('click')
    await Vue.nextTick()

    expect(wrapper.find('.text-danger').exists()).toBe(true)
    expect(wrapper.find('.text-danger').text())
      .toBe('Please place all the selected datasets on the grid!')
  })

  it('it should set ds placement on the grid and advance to comparison page', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    // advances first and second step
    wrapper.find('.el-select').trigger('click')
    wrapper.find('.el-select-dropdown__item').trigger('click')
    await Vue.nextTick()
    wrapper.find('.el-select').trigger('click')
    wrapper.findAll('.el-select-dropdown__item').at(1).trigger('click')
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

    expect(wrapper.find('.text-danger').exists()).toBe(false)
    // expect(wrapper.vm.$route.name).toBe('datasets-comparison')
    // expect(wrapper.vm.$route.query.ds).toBe(graphqlReturnData.map((ds) => ds.id).sort().join(','))
  })
})
