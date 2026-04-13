import { nextTick, ref, h, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store'
import { DatasetActionsDropdown } from './DatasetActionsDropdown'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'
import { DefaultApolloClient, useMutation, useQuery } from '@vue/apollo-composable'

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

    expect(wrapper.findAll('.mock-el-dropdown-item').length).toBe(7)
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

    expect(wrapper.findAll('.mock-el-dropdown-item').length).toBe(6)
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

    expect(wrapper.findAll('.mock-el-dropdown-item').length).toBe(3)
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
})
