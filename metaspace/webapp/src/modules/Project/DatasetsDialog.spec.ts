import { defineComponent, nextTick, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import DatasetsDialog from './DatasetsDialog'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import store from '../../store'
import router from '../../router'
import { vi } from 'vitest'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))

const graphqlWithNoData = {
  allDatasets: [],
}
const graphqlWithData = {
  allDatasets: [
    {
      id: '2021-03-31_11h02m28s',
      name: 'New 3 (1)',
      uploadDT: '2021-03-31T14:02:28.722Z',
    },
    {
      id: '2021-03-30_18h25m18s',
      name: 'Untreated_3_434_super_lite_19_31 (1)',
      uploadDT: '2021-03-30T21:25:18.473Z',
    },
  ],
}
let graphqlWithNoDataClient: any
let graphqlWithDataClient: any

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

  const testHarness = defineComponent({
    components: {
      DatasetsDialog,
    },
    setup() {
      return () => h(DatasetsDialog, { props: propsData })
    },
  })

  beforeAll(async () => {
    graphqlWithNoDataClient = await initMockGraphqlClient({
      Query: () => graphqlWithNoData,
    })
    graphqlWithDataClient = await initMockGraphqlClient({
      Query: () => graphqlWithData,
    })
  })

  it('it should have disabled update button when no data available', async () => {
    ;(useQuery as any).mockReturnValue({
      result: ref(graphqlWithNoData),
      loading: ref(false),
      onResult: vi.fn(),
    })

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlWithNoDataClient,
        },
      },
      props: propsData,
    })
    await flushPromises()
    await nextTick()

    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(true)
  })

  it('it should have disabled update button when no dataset selection has changed', async () => {
    ;(useQuery as any).mockReturnValue({
      result: ref(graphqlWithData),
      loading: ref(false),
      onResult: vi.fn(),
    })

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlWithDataClient,
        },
      },
      props: propsData,
    })
    await flushPromises()
    await nextTick()

    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(true)
  })
})
