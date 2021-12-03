import { mount } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import DatasetComparisonPage from './DatasetComparisonPage'
import { initMockGraphqlClient, apolloProvider } from '../../../../tests/utils/mockGraphqlClient'

describe('DatasetComparisonPage', () => {
  const snapshotData = jest.fn((src: any, args: any, ctx: any) => ({
    snapshot: '{"nCols":2,"nRows":1,"grid":{"0-0":"2021-04-14_07h23m35s",'
      + '"0-1":"2021-04-06_08h35m04s"}}',
  }))

  const dsData = [{
    id: '2021-04-14_07h23m35s',
    name: 'Mock (1)',
    uploadDT: '2021-03-31T14:02:28.722Z',
  },
  {
    id: '2021-04-06_08h35m04s',
    name: 'Mock (2)',
    uploadDT: '2021-03-30T21:25:18.473Z',
  }]

  const testHarness = Vue.extend({
    components: {
      DatasetComparisonPage,
    },
    render(h) {
      return h(DatasetComparisonPage, { props: this.$attrs })
    },
  })

  const graphqlWithData = () => {
    initMockGraphqlClient({
      Query: () => ({
        imageViewerSnapshot: snapshotData,
        allAnnotations: () => {
          return []
        },
        allDatasets: () => {
          return dsData
        },
      }),
    })
  }

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
  })

  it('it should match snapshot', async() => {
    router.replace({
      name: 'datasets-comparison',
      query: {
        viewId: 'xxxx',
      },
      params: {
        dataset_id: 'xxxx',
      },
    })
    graphqlWithData()
    const wrapper = mount(testHarness, {
      store,
      router,
    })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should match not found snapshot', async() => {
    router.replace({
      name: 'datasets-comparison',
      params: {
        dataset_id: 'xxxx',
      },
    })
    graphqlWithData()
    const wrapper = mount(testHarness, {
      store,
      router,
    })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })
})
