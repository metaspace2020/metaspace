import { nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import EditUserPage from './EditUserPage.vue'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import { vi } from 'vitest'
import { DefaultApolloClient, useMutation, useQuery } from '@vue/apollo-composable'
import store from '../../store'
import router from '../../router'
import { ElMessageBox } from '../../lib/element-plus'

vi.mock('element-plus', async () => {
  const actual: any = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessageBox: {
      confirm: vi.fn(),
    },
  }
})

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

let graphqlMocks: any
describe('EditUserPage', () => {
  const mockCurrentUser = {
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
  const mockUpdateUserMutation = vi.fn(() => ({}))
  const graphqlMock = async () => {
    const queryParams = {
      currentUser: () => mockCurrentUser,
    }
    const mutateParams = {
      updateUser: mockUpdateUserMutation,
    }
    graphqlMocks = await initMockGraphqlClient({
      Query: () => queryParams,
      Mutation: () => mutateParams,
    })
    ;(useQuery as any).mockReturnValue({
      result: ref(Object.keys(queryParams).reduce((acc, key) => ({ ...acc, [key]: queryParams[key]() }), {})),
      loading: ref(false),
      onResult: vi.fn(),
      refetch: vi.fn(),
    })
    ;(useMutation as any).mockReturnValue({
      mutate: mockUpdateUserMutation,
    })
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    await graphqlMock()
  })

  it('should match snapshot', async () => {
    const wrapper = mount(EditUserPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should be able to submit changes to the user', async () => {
    const wrapper = mount(EditUserPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    const saveButton = wrapper.find('.saveButton')
    const name = 'foo bar'
    const email = 'changed@bar.baz'

    wrapper.vm.model.name = name
    wrapper.vm.model.email = email
    saveButton.trigger('click')

    await flushPromises()
    await nextTick()

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      'Are you sure you want to change email address? ' +
        'A verification email will be sent to your new address to confirm the change.',
      'Confirm email address change',
      {
        confirmButtonText: 'Yes, send verification email',
        lockScroll: false,
      }
    )

    expect(mockUpdateUserMutation).toHaveBeenCalledTimes(1)
  })

  it('should not include unchanged fields in the update payload', async () => {
    const wrapper = mount(EditUserPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    const saveButton = wrapper.find('.saveButton')
    const name = 'foo bar'

    wrapper.vm.model.name = name
    saveButton.trigger('click')

    await flushPromises()
    await nextTick()

    expect(ElMessageBox.confirm).not.toHaveBeenCalledWith(
      'Are you sure you want to change email address? ' +
        'A verification email will be sent to your new address to confirm the change.',
      'Confirm email address change',
      {
        confirmButtonText: 'Yes, send verification email',
        lockScroll: false,
      }
    )

    expect(mockUpdateUserMutation).toHaveBeenCalledTimes(1)
  })
})
