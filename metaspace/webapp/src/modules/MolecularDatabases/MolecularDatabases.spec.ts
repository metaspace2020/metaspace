import { mount } from '@vue/test-utils'
import Vue from 'vue'
import MolecularDatabases from './MolecularDatabases'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import { mockMolecularDatabases } from '../../../tests/utils/mockGraphqlData'

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

  const mockDatabaseFn = jest.fn((src: any, args: any, ctx: any, info: any): any => mockDatabase)
  const graphqlMocks = {
    Query: () => ({
      currentUser: () => ({ id: 'userid' }),
      group: () => mockGroup,
      molecularDB: mockDatabaseFn,
    }),
  }

  // needs to be a full component for `router.app` to work
  const TestMolecularDatabases = Vue.component('test-molecular-databases', {
    components: { MolecularDatabases },
    props: ['groupId', 'canDelete'],
    template: '<molecular-databases :groupId="groupId" :canDelete="canDelete" />',
  })

  const propsData = { groupId: mockGroup.id }

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should match snapshot', async() => {
    initMockGraphqlClient(graphqlMocks)
    const wrapper = mount(TestMolecularDatabases, { router, apolloProvider, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  describe('details view', () => {
    beforeEach(() => {
      router.replace({ query: { tab: 'databases', db: mockDatabase.id.toString() } })
    })

    it('should match snapshot', async() => {
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(TestMolecularDatabases, { router, apolloProvider, propsData })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (archived)', async() => {
      mockDatabaseFn.mockImplementation(() => ({ ...mockDatabase, archived: true }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(TestMolecularDatabases, { router, apolloProvider, propsData })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (manager)', async() => {
      initMockGraphqlClient(graphqlMocks)
      const _propsData = { ...propsData, canDelete: true }
      const wrapper = mount(TestMolecularDatabases, { router, apolloProvider, propsData: _propsData })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })
  })
})
