import { nextTick, ref, h, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'
import { vi } from 'vitest'
import { DefaultApolloClient, useMutation, useQuery } from '@vue/apollo-composable'
import router from '../../../router'
import store from '../../../store'
import { DatasetComparisonDialog } from './DatasetComparisonDialog'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

let mockRoutePush

let graphqlMocks: any
describe('DatasetComparisonDialog', () => {
  const propsData = {
    selectedDatasetIds: ['2021-03-31_11h01m28s', '2021-03-30_18h22m18s', '2021-04-06_08h33m04s'],
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
    selectedDatasetIds: ['2021-03-31_11h02m28s'],
  }

  const graphqlReturnData = [
    {
      id: '2021-03-31_11h01m28s',
      name: 'Mock (1)',
      uploadDT: '2021-03-31T14:02:28.722Z',
    },
    {
      id: '2021-03-30_18h22m18s',
      name: 'Mock (2)',
      uploadDT: '2021-03-30T21:25:18.473Z',
    },
    {
      id: '2021-04-06_08h33m04s',
      name: 'Mock (3)',
      uploadDT: '2021-03-30T21:25:18.473Z',
    },
    {
      id: '2021-03-30_18h23m18s',
      name: 'Mock (4)',
      uploadDT: '2021-03-30T21:25:18.473Z',
    },
    {
      id: '2021-04-06_08h34m04s',
      name: 'Mock (5)',
      uploadDT: '2021-03-30T21:25:18.473Z',
    },
  ]

  const mockAnnotationAgg = vi.fn(() => ({
    data: {
      saveImageViewerSnapshot: 'saveImageViewerSnapshot',
    },
  }))

  const testHarness = defineComponent({
    components: {
      DatasetComparisonDialog,
    },
    props: ['selectedDatasetIds'],
    setup(props) {
      return () => h(DatasetComparisonDialog, { ...props })
    },
  })

  const mockGraphql = async (qyeryParams, mutationParams) => {
    graphqlMocks = await initMockGraphqlClient({
      Query: () => qyeryParams,
      Mutation: () => mutationParams,
    })
    ;(useQuery as any).mockReturnValue({
      result: ref(Object.keys(qyeryParams).reduce((acc, key) => ({ ...acc, [key]: qyeryParams[key]() }), {})),
      loading: ref(false),
      onResult: vi.fn(),
    })
    ;(useMutation as any).mockReturnValue({
      mutate: mockAnnotationAgg,
    })
  }

  const graphqlWithData = async () => {
    const queryParams = {
      allDatasets: () => {
        return graphqlReturnData
      },
    }
    const mutationParams = {
      saveImageViewerSnapshot: mockAnnotationAgg,
    }

    await mockGraphql(queryParams, mutationParams)
  }

  beforeAll(async () => {
    await graphqlWithData()
  })

  it('it should match snapshot', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: propsData,
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('it should display the minimum required datasets error', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: propsDataUnique,
    })

    await flushPromises()
    await nextTick()

    wrapper.find('.el-button--primary').trigger('click')

    await nextTick()

    expect((wrapper.find('.text-danger').element as any).style.visibility).not.toBe('hidden')
    expect(wrapper.find('.text-danger').text()).toBe('Please select at least two datasets to be compared!')
  })

  it('it should select a dataset and advance to the next step', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: propsData,
    })

    await flushPromises()
    await nextTick()

    wrapper.find('.el-button--primary').trigger('click')
    await nextTick()

    expect((wrapper.find('.text-danger').element as any).style.visibility).toBe('hidden')
    expect(wrapper.findAll('.sm-workflow-step').at(1).classes().includes('active')).toBe(true)
  })

  it('it should check the ds comparison grid n of cols and rows', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: propsData,
    })

    await flushPromises()
    await nextTick()

    // advances first step
    wrapper.find('.el-button--primary').trigger('click')
    await nextTick()

    expect(wrapper.findAll('.dataset-comparison-dialog-row').length).toBe(2)
    expect(wrapper.findAll('.dataset-comparison-dialog-col').length).toBe(4)
  })

  it('it should display the final min grid size error', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: manySelectedPropsData,
    })

    await flushPromises()
    await nextTick()

    // advances first step
    wrapper.find('.el-button--primary').trigger('click')
    await nextTick()

    wrapper.find('.el-button--primary').trigger('click')
    await nextTick()

    expect((wrapper.find('.text-danger').element as any).style.visibility).not.toBe('hidden')
    expect(wrapper.find('.text-danger').text()).toBe('The grid must have enough cells to all datasets!')
  })

  it('it should display the final step required error', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: propsData,
    })

    await flushPromises()
    await nextTick()

    // advances first and second step and tries to compare
    wrapper.find('.el-button--primary').trigger('click')
    await nextTick()
    wrapper.find('.el-button--primary').trigger('click')
    await nextTick()
    wrapper.find('.el-button--primary').trigger('click')
    await nextTick()

    expect((wrapper.find('.text-danger').element as any).style.visibility).not.toBe('hidden')
    expect(wrapper.find('.text-danger').text()).toBe('Please place all the selected datasets on the grid!')
  })

  it('it should set ds placement on the grid and advance to comparison page', async () => {
    mockRoutePush = vi.fn()
    vi.mock('vue-router', async () => {
      const actual: any = await vi.importActual('vue-router')
      return {
        ...actual,
        useRouter: () => {
          return {
            push: mockRoutePush,
          }
        },
      }
    })
    const wrapper = mount(DatasetComparisonDialog, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: propsData,
    })

    await flushPromises()
    await nextTick()
    // advances first and second step
    wrapper.find('.el-button--primary').trigger('click')
    await nextTick()
    wrapper.find('.el-button--primary').trigger('click')
    await nextTick()

    // place datasets
    wrapper.vm.state.arrangement = {
      '0-0': propsData.selectedDatasetIds[0],
      '0-1': propsData.selectedDatasetIds[1],
      '0-2': propsData.selectedDatasetIds[2],
    }
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 500))

    wrapper.find('.el-button--primary').trigger('click')
    await nextTick()

    expect((wrapper.find('.text-danger').element as any).style.visibility).toBe('hidden')
    expect(mockAnnotationAgg).toHaveBeenCalledTimes(1)
    await nextTick()

    // check if the user was redirect to the page with the correct params
    expect(mockRoutePush).toHaveBeenCalledWith({
      name: 'datasets-comparison',
      query: {
        viewId: 'saveImageViewerSnapshot',
      },
      params: {
        dataset_id: '2021-03-31_11h01m28s',
      },
    })
  })
})
