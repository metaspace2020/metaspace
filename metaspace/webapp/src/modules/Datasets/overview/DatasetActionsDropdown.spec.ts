import { nextTick, ref, h, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store'
import { DatasetActionsDropdown } from './DatasetActionsDropdown'
import { SegmentationDialog } from '../segmentation/SegmentationDialog'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'
import { DefaultApolloClient, useMutation, useQuery } from '@vue/apollo-composable'
import { checkIfHasBrowserFiles, getSegmentationJobsQuery } from '../../../api/dataset'
import { checkIfEnrichmentRequested } from '../../../api/enrichmentdb'
import { ElNotification } from '../../../lib/element-plus'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

let graphqlMocks: any

describe('DatasetActionsDropdown', () => {
  const mockDataset = {
    id: '2021-03-11_08h29m21s',
    name: 'JD_Sampe',
    submitter: {
      id: 'xxxx',
      name: 'John Doe',
      email: 'jdoe@test.com',
    },
    principalInvestigator: {
      name: 'Test',
      email: 'jdoe@test.com',
    },
    group: {
      id: 'gxxxx',
      name: 'TEST_GROUP',
      shortName: 'TG',
    },
    groupApproved: true,
    projects: [
      {
        id: 'pj1',
        name: 'Test',
        publicationStatus: 'UNPUBLISHED',
      },
    ],
    isPublic: true,
    status: 'FINISHED',
    statusUpdateDT: '2021-03-22T01:54:04.856Z',
    metadataType: 'Imaging MS',
    canEdit: true,
    canDelete: true,
    canDownload: true,
    uploadDT: '2021-03-11T14:29:21.641Z',
  }
  const mockUserAdmin = {
    id: 'xxxx',
    name: 'John Doe',
    role: 'admin',
  }

  const mockUserOwner = {
    id: 'xxxx',
    name: 'John Doe',
  }

  const mockUser = {
    id: 'yyyy',
    name: 'John Doe',
  }

  const propsData = { dataset: mockDataset, currentUser: mockUserAdmin }
  const propsDataOwner = { dataset: mockDataset, currentUser: mockUserOwner }
  const propsDataNormal = {
    dataset: { ...mockDataset, canEdit: false, canDelete: false },
    currentUser: mockUser,
  }
  const propsDataNormalNoOptions = {
    dataset: { ...mockDataset, canEdit: false, canDelete: false, canDownload: false },
    currentUser: mockUser,
  }

  const testHarness = defineComponent({
    components: {
      DatasetActionsDropdown,
    },
    setup(props, { attrs }) {
      return () => h(DatasetActionsDropdown, { ...attrs, ...props })
    },
  })

  const mockQueryResult = (result: any, loading = false) => ({
    result: ref(result),
    loading: ref(loading),
    refetch: vi.fn(),
    onResult: vi.fn(),
  })

  // Routes each useQuery call to a canned result based on which document was passed. Any query
  // this spec does not know about throws, so a future query fails loudly instead of silently
  // returning undefined.
  const mockQueries = () => {
    ;(useQuery as any).mockImplementation((query: any) => {
      if (query === checkIfEnrichmentRequested) {
        return mockQueryResult({ enrichmentRequested: false })
      }
      if (query === getSegmentationJobsQuery) {
        return mockQueryResult({ segmentationJobs: [] })
      }
      if (query === checkIfHasBrowserFiles) {
        return mockQueryResult({ hasImzmlFiles: false })
      }
      throw new Error('Unexpected query passed to useQuery')
    })
  }

  const mockGraphql = async (qyeryParams, mutationParams) => {
    graphqlMocks = await initMockGraphqlClient({
      Query: () => qyeryParams,
      Mutation: () => mutationParams,
    })
    mockQueries()
    ;(useMutation as any).mockReturnValue({
      mutate: mutationParams,
    })
  }

  const graphqlWithData = async () => {
    const queryParams = {
      enrichmentRequested: () => {
        return false
      },
      checkIfHasBrowserFiles: () => {
        return false
      },
    }
    const mutationParams = {
      deleteDataset: vi.fn(),
    }

    await mockGraphql(queryParams, mutationParams)
  }

  let notificationWarning: any

  beforeAll(async () => {
    await graphqlWithData()
    notificationWarning = vi.spyOn(ElNotification, 'warning').mockImplementation(() => ({ close: vi.fn() }) as any)
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

  it('it show all options to the admin', async () => {
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

    expect(wrapper.findAll('.mock-el-dropdown-item').length).toBe(9)
  })

  it('it show all options except reprocess if user is the ds owner, but not admin', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: propsDataOwner,
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.findAll('.mock-el-dropdown-item').length).toBe(8)
  })

  it('it show only canDownload option for normalUser', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: propsDataNormal,
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.findAll('.mock-el-dropdown-item').length).toBe(4)
  })

  it('it show only canDownload option for normalUser', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
      props: propsDataNormalNoOptions,
    })
    expect(wrapper.findAll('.mock-el-dropdown-item').length).toBe(2)
    // expect((wrapper.find('.mock-el-dropdown').element as any).style.visibility).toBe('hidden')
  })

  describe('segmentation access', () => {
    // The dropdown reports the picked item through ElDropdown's `command` event, which is what
    // `handleCommand` is bound to. The stubbed ElDropdown has no props/emits of its own, so
    // `$emit` falls through to the `onCommand` listener the component passed in.
    const pickSegmentation = async (props: any) => {
      mockQueries()
      notificationWarning.mockClear()

      const wrapper = mount(testHarness, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
        },
        props,
      })

      await flushPromises()
      await nextTick()

      wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'segmentation')

      await flushPromises()
      await nextTick()

      return wrapper
    }

    // Segmentation is no longer Pro-gated: any dataset editor can open the dialog. Free-tier
    // usage limits are enforced server-side when the job is submitted.
    it('should open the segmentation dialog for a dataset editor without a Pro subscription', async () => {
      const wrapper = await pickSegmentation(propsDataOwner)

      expect(wrapper.findComponent(SegmentationDialog).exists()).toBe(true)
      expect(notificationWarning).not.toHaveBeenCalled()
    })

    it('should warn a non-editor without an existing segmentation instead of opening the dialog', async () => {
      const wrapper = await pickSegmentation(propsDataNormal)

      expect(wrapper.findComponent(SegmentationDialog).exists()).toBe(false)
      expect(notificationWarning).toHaveBeenCalledTimes(1)
      expect(String(notificationWarning.mock.calls[0][0])).toContain('dataset owner')
    })
  })
})
