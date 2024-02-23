import { flushPromises, mount } from '@vue/test-utils'
import { ElButton, ElCheckbox } from 'element-plus'
import { nextTick, ref } from 'vue'
import TransferDatasetsDialog from './TransferDatasetsDialog.vue'
import router from '../../router'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { vi } from 'vitest'
import store from '../../store'

let graphqlMocks

const mockDatasets = [
  { id: '2018-06-28_13h23m10s', name: 'Untreated_3_434', uploadDT: '2018-06-28T13:23:10.837000' },
  { id: '2018-06-28_13h21m36s', name: 'Dataset 2', uploadDT: '2018-06-28T13:21:36.973867' },
  { id: '2018-06-28_12h03m36s', name: 'Dataset 3', uploadDT: '2018-06-28T12:03:36.409743' },
  { id: '2018-06-28_13h20m44s', name: 'Dataset 4', uploadDT: '2018-06-28T13:20:44.736472' },
]
const mockProps = {
  currentUserId: 'current user id',
  groupName: 'Group Name',
  isInvited: true,
}
const stubs = {
  DatasetItem: {
    template: '<div class="mock-ds-item"><slot></slot></div>',
    props: ['dataset'],
  },
  ElTable: {
    template: '<div class="mock-el-table"><slot></slot></div>',
    props: ['data', 'columns', 'tableId'], // include other props as necessary
  },
  ElTableColumn: {
    template: '<div class="mock-el-table-column"><slot></slot></div>',
    props: ['data', 'columns', 'tableId'], // include other props as necessary
  },
}

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))
const mockGraphql = async (params) => {
  graphqlMocks = await initMockGraphqlClient({
    Query: () => params,
  })
  ;(useQuery as any).mockReturnValue({
    result: ref(Object.keys(params).reduce((acc, key) => ({ ...acc, [key]: params[key]() }), {})),
    loading: ref(false),
    onResult: vi.fn(),
  })
}
describe('TransferDatasetsDialog', () => {
  ;[false, true].forEach((hasDatasets) => {
    ;[false, true].forEach((isInvited) => {
      it(`should match snapshot (${hasDatasets ? 'datasets to import' : 'no datasets'}, ${
        isInvited ? 'invited' : 'requesting access'
      })`, async () => {
        if (hasDatasets) {
          await mockGraphql({ allDatasets: () => mockDatasets })
        } else {
          await mockGraphql({ allDatasets: () => [] })
        }
        const props = { ...mockProps, isInvited }
        const wrapper = mount(TransferDatasetsDialog, {
          global: {
            plugins: [store, router],
            stubs,
            provide: {
              [DefaultApolloClient]: graphqlMocks,
            },
          },
          props,
        })

        await flushPromises()
        await nextTick()

        expect(wrapper.html()).toMatchSnapshot()
      })
    })
  })

  it('should call back on success when some datasets are selected', async () => {
    await mockGraphql({ allDatasets: () => mockDatasets })
    const wrapper = mount(TransferDatasetsDialog, {
      global: {
        plugins: [store, router],
        stubs,
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: mockProps,
    })
    await flushPromises()
    await nextTick()

    const checkbox = wrapper.findComponent(ElCheckbox)
    await checkbox.trigger('click')
    await nextTick()

    const primaryButton = wrapper
      .findAllComponents(ElButton)
      .filter((b) => b.props().type === 'primary')
      .at(0)
    await primaryButton.trigger('click')
    await nextTick()

    expect(wrapper.emitted('accept')).toEqual([[mockDatasets.slice(1).map((ds) => ds.id)]])
  })
})
