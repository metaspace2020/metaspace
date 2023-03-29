import { mount, shallowMount } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import { DatasetActionsDropdown } from './DatasetActionsDropdown'
import { initMockGraphqlClient, apolloProvider } from '../../../../tests/utils/mockGraphqlClient'

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

  const testHarness = Vue.extend({
    components: {
      DatasetActionsDropdown,
    },
    render(h) {
      return h(DatasetActionsDropdown, { props: this.$attrs })
    },
  })

  const graphqlWithData = () => {
    initMockGraphqlClient({
      Query: () => ({
        enrichmentRequested: () => {
          return false
        },
        checkIfHasBrowserFiles: () => {
          return false
        },
      }),
    })
  }

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
    graphqlWithData()
  })

  it('it should match snapshot', async() => {
    const wrapper = shallowMount(testHarness, { store, router, apolloProvider, propsData })

    expect(wrapper).toMatchSnapshot()
  })

  it('it show all options to the admin', async() => {
    const wrapper = mount(testHarness, { store, router, apolloProvider, propsData })
    await Vue.nextTick()
    expect(wrapper.findAll('li').length).toBe(7)
  })

  it('it show all options except reprocess if user is the ds owner, but not admin', async() => {
    const wrapper = mount(testHarness, { store, router, apolloProvider, propsData: propsDataOwner })
    await Vue.nextTick()
    expect(wrapper.findAll('li').length).toBe(6)
  })

  it('it show only canDownload option for normalUser', async() => {
    const wrapper = mount(testHarness, { store, router, propsData: propsDataNormal })
    await Vue.nextTick()
    expect(wrapper.findAll('li').length).toBe(3)
  })

  it('it show only canDownload option for normalUser', async() => {
    const wrapper = mount(testHarness, { store, router, apolloProvider, propsData: propsDataNormalNoOptions })
    await Vue.nextTick()

    expect(wrapper.findAll('li').length).toBe(2)
    expect(wrapper.find('.el-dropdown').element.style.visibility).toBe('hidden')
  })
})
