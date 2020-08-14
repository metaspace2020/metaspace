import { mount, Stubs } from '@vue/test-utils'
import Vue from 'vue'
import MolecularDatabases from './MolecularDatabases'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import { mockMolecularDatabases } from '../../../tests/utils/mockGraphqlData'

describe.skip('MolecularDatabases', () => {
  const mockGroup = {
    id: '00000000-1111-2222-3333-444444444444',
    name: 'group name',
    shortName: 'groupShortName',
    urlSlug: null,
    currentUserRole: null,
    numMembers: 2,
    members: [],
    numDatabases: 2,
  }

  const database = {
    ...mockMolecularDatabases()[0],
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

  const mockGroupFn = jest.fn((src: any, args: any, ctx: any, info: any): any => mockGroup)
  const graphqlMocks = {
    Query: () => ({
      currentUser: () => ({ id: 'userid' }),
      group: mockGroupFn,
      groupByUrlSlug: mockGroupFn,
      allDatasets: () => ([
        { id: 'datasetId1', name: 'dataset name 1', status: 'FINISHED' },
        { id: 'datasetId2', name: 'dataset name 2', status: 'QUEUED' },
        { id: 'datasetId3', name: 'dataset name 3', status: 'ANNOTATING' },
        { id: 'datasetId4', name: 'dataset name 4', status: 'FINISHED' },
      ]),
      countDatasets: () => 4,
    }),
  }

  const stubs: Stubs = {
    DatasetItem: true,
    MolecularDatabases: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should match snapshot', async() => {
    mockGroupFn.mockImplementation(() => ({
      ...mockGroup, currentUserRole: 'MEMBER', molecularDatabases: mockMolecularDatabases,
    }))
    initMockGraphqlClient(graphqlMocks)
    const wrapper = mount(MolecularDatabases, { router, stubs, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  describe('details view', () => {
    beforeEach(() => {
      router.replace({ query: { tab: 'databases', db: database.id.toString() } })
    })

    it('should match snapshot', async() => {
      mockGroupFn.mockImplementation(() => ({
        ...mockGroup,
        currentUserRole: 'MEMBER',
      }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(MolecularDatabases, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (manager)', async() => {
      mockGroupFn.mockImplementation(() => ({
        ...mockGroup,
        currentUserRole: 'GROUP_ADMIN',
      }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(MolecularDatabases, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })
  })
})
