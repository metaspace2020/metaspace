import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import { vi } from 'vitest'
import { DefaultApolloClient, useMutation, useQuery } from '@vue/apollo-composable'
import router from '../../router'
import store from '../../store'
import MolecularDatabases from './MolecularDatabases'
import { mockMolecularDatabases } from '../../tests/utils/mockGraphqlData'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))
let graphqlMocks: any

describe('MolecularDatabases', () => {
  const mockDatabases = mockMolecularDatabases()
  const mockGroup = {
    id: '00000000-1111-2222-3333-444444444444',
    numDatabases: 2,
    molecularDatabases: [
      {
        ...mockDatabases[0],
        archived: true,
      },
      {
        ...mockDatabases[1],
        isPublic: true,
      },
    ],
  }

  const mockDatabase = {
    ...mockDatabases[0],
    archived: false,
    citation: null,
    description: null,
    fullName: '',
    link: '',
    isPublic: false,
    group: {
      id: mockGroup.id,
    },
  }

  const mockDatabaseFn = vi.fn((): any => mockDatabase)
  const mockGraphql = async (params) => {
    graphqlMocks = await initMockGraphqlClient({
      Query: () => params,
    })
    ;(useQuery as any).mockReturnValue({
      result: ref(Object.keys(params).reduce((acc, key) => ({ ...acc, [key]: params[key]() }), {})),
      loading: ref(false),
      refetch: vi.fn(),
      onResult: vi.fn(),
    })
    ;(useMutation as any).mockReturnValue({
      mutate: vi.fn(),
    })
  }

  const TestMolecularDatabases = defineComponent({
    components: {
      MolecularDatabases,
    },
    props: ['groupId', 'canDelete'],
    setup(props) {
      return () => h(MolecularDatabases, { ...props })
    },
  })

  const propsData = { groupId: mockGroup.id }

  beforeEach(async () => {
    vi.clearAllMocks()
    await mockGraphql({
      currentUser: () => ({ id: 'userid' }),
      group: () => mockGroup,
      molecularDB: mockDatabaseFn,
    })
  })

  it('should match snapshot', async () => {
    const wrapper = mount(TestMolecularDatabases, {
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

  describe('details view', () => {
    beforeEach(async () => {
      await router.replace({ query: { tab: 'databases', db: mockDatabase.id.toString() } })
    })

    it('should match snapshot', async () => {
      const wrapper = mount(TestMolecularDatabases, {
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

    it('should match snapshot (archived)', async () => {
      await mockGraphql({
        currentUser: () => ({ id: 'userid' }),
        group: () => mockGroup,
        molecularDB: vi.fn(() => ({ ...mockDatabase, archived: true })),
      })
      const wrapper = mount(TestMolecularDatabases, {
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

    it('should match snapshot (manager)', async () => {
      initMockGraphqlClient(graphqlMocks)
      const _propsData = { ...propsData, canDelete: true }
      const wrapper = mount(TestMolecularDatabases, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
        },
        props: _propsData,
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })
  })
})
