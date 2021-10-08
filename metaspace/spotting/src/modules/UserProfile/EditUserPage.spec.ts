import { mount, Wrapper } from '@vue/test-utils'
import Vue from 'vue'
import { DeepPartial } from 'ts-essentials'
import { restoreConsole, suppressConsoleWarn } from '../../../tests/utils/suppressConsole'
import EditUserPage from './EditUserPage.vue'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import { UserProfileQuery } from '../../api/user'

describe('EditUserPage', () => {
  const mockCurrentUser: DeepPartial<UserProfileQuery> = {
    id: '22333',
    name: 'foo',
    email: 'foo@bar.baz',
    role: 'user',
    groups: [
      { role: 'MEMBER', numDatasets: 0, group: { id: 'AAA', name: 'Group A', urlSlug: 'grp-a' } },
      { role: 'INVITED', numDatasets: 0, group: { id: 'BBB', name: 'Group B', urlSlug: null } },
      { role: 'PENDING', numDatasets: 0, group: { id: 'CCC', name: 'Group C', urlSlug: null } },
      { role: 'GROUP_ADMIN', numDatasets: 20, group: { id: 'DDD', name: 'Group D', urlSlug: null } },
    ],
    primaryGroup: { role: 'GROUP_ADMIN', numDatasets: 20, group: { id: 'DDD', name: 'Group D', urlSlug: null } },
    projects: [
      { role: 'MEMBER', numDatasets: 0, project: { id: 'AA', name: 'Project A', urlSlug: 'proj-a' } },
      { role: 'INVITED', numDatasets: 0, project: { id: 'BB', name: 'Project B', urlSlug: null } },
      { role: 'PENDING', numDatasets: 0, project: { id: 'CC', name: 'Project C', urlSlug: null } },
      { role: 'MANAGER', numDatasets: 20, project: { id: 'DD', name: 'Project D', urlSlug: null } },
    ],
  }

  const mockUpdateUserMutation = jest.fn((src: any, args: any, ctx: any) => ({}))

  beforeEach(() => {
    suppressConsoleWarn('async-validator:')
    jest.clearAllMocks()
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => mockCurrentUser,
      }),
      Mutation: () => ({
        updateUser: mockUpdateUserMutation,
      }),
    })
  })

  afterEach(async() => {
    restoreConsole()
  })

  it('should match snapshot', async() => {
    const wrapper = mount(EditUserPage, { router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should be able to submit changes to the user', async() => {
    const wrapper = mount(EditUserPage, { router, apolloProvider })
    await Vue.nextTick()
    const nameInput = wrapper.find('input[name="name"]')
    const emailInput = wrapper.find('input[name="email"]')
    const saveButton = wrapper.find('.saveButton')
    const name = 'foo bar'
    const email = 'changed@bar.baz'
    wrapper.vm.$confirm = jest.fn(() => Promise.resolve('confirm'))
    await Vue.nextTick()

    nameInput.setValue(name)
    emailInput.setValue(email)
    await Vue.nextTick()
    saveButton.trigger('click')
    await Vue.nextTick()

    expect(mockUpdateUserMutation).toHaveBeenCalledTimes(1)
    expect(mockUpdateUserMutation.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        userId: mockCurrentUser.id,
        update: {
          name,
          email,
        },
      }),
    )
  })

  it('should not include unchanged fields in the update payload', async() => {
    const wrapper = mount(EditUserPage, { router, apolloProvider })
    await Vue.nextTick()
    const nameInput = wrapper.find('input[name="name"]')
    const saveButton = wrapper.find('.saveButton')
    const name = 'foo bar'
    wrapper.vm.$confirm = jest.fn(() => Promise.resolve('confirm'))

    nameInput.setValue(name)
    await Vue.nextTick()
    saveButton.trigger('click')
    await Vue.nextTick()

    expect(mockUpdateUserMutation).toHaveBeenCalledTimes(1)
    expect(mockUpdateUserMutation.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        userId: mockCurrentUser.id,
        update: { name },
      }),
    )
  })
})
