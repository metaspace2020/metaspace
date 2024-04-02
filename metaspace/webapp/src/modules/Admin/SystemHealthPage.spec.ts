import { nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import SystemHealthPage from './SystemHealthPage.vue'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import { vi } from 'vitest'
import { DefaultApolloClient, useMutation, useQuery } from '@vue/apollo-composable'
import store from '../../store'
import router from '../../router'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

let graphqlMocks: any

describe('SystemHealthPage', () => {
  const mockGraphql = async (qyeryParams, mutationParams) => {
    graphqlMocks = await initMockGraphqlClient({
      Query: () => qyeryParams,
      Mutation: () => mutationParams,
    })
    ;(useQuery as any).mockReturnValue({
      result: ref(Object.keys(qyeryParams).reduce((acc, key) => ({ ...acc, [key]: qyeryParams[key]() }), {})),
      loading: ref(false),
      onResult: vi.fn(),
      subscribeToMore: vi.fn(),
    })
    ;(useMutation as any).mockReturnValue({
      mutate: mutationParams,
    })
  }
  const adminQuery = async () => {
    const queryParams = {
      currentUser: () => ({ id: 'userid', role: 'admin' }),
    }
    const mutationParams = {
      updateSystemHealth: () => true,
    }
    await mockGraphql(queryParams, mutationParams)
  }
  const updateErrorQuery = async () => {
    const queryParams = {
      currentUser: () => ({ id: 'userid', role: 'admin' }),
    }
    const mutationParams = {
      updateSystemHealth: () => new Error('internal error'),
    }
    await mockGraphql(queryParams, mutationParams)
  }
  const userQuery = async () => {
    const queryParams = {
      currentUser: () => ({ id: 'userid', role: 'user' }),
    }
    await mockGraphql(queryParams, {})
  }

  it('should match snapshot logged as non-admin', async () => {
    await userQuery()
    const wrapper = mount(SystemHealthPage, {
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

  it('should match snapshot logged as admin', async () => {
    await adminQuery()
    const wrapper = mount(SystemHealthPage, {
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

  it('should be able to toggle all system health options as admin', async () => {
    await adminQuery()
    const wrapper = mount(SystemHealthPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    wrapper.vm.mode = 0
    await nextTick()
    expect(wrapper.findAll('.el-radio').at(0).classes()).toContain('is-checked')

    wrapper.vm.mode = 1
    await nextTick()
    expect(wrapper.findAll('.el-radio').at(1).classes()).toContain('is-checked')

    wrapper.vm.mode = 2
    await nextTick()
    expect(wrapper.findAll('.el-radio').at(2).classes()).toContain('is-checked')
  })

  it('should toggle Enable everything option and update', async () => {
    await adminQuery()
    const wrapper = mount(SystemHealthPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    wrapper.vm.mode = 0
    await nextTick()

    expect(wrapper.find('.el-button').text()).toBe('Update')
    wrapper.find('.el-button').trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.el-button').text()).toBe('Updated')
  })

  it('should toggle Disable dataset upload/reprocessing option and update', async () => {
    await adminQuery()
    const wrapper = mount(SystemHealthPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    wrapper.vm.mode = 1
    await nextTick()

    expect(wrapper.find('.el-button').text()).toBe('Update')
    wrapper.find('.el-button').trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.el-button').text()).toBe('Updated')
  })

  it('should toggle Read-only mode option and update', async () => {
    await adminQuery()
    const wrapper = mount(SystemHealthPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    wrapper.vm.mode = 2
    await nextTick()

    expect(wrapper.find('.el-button').text()).toBe('Update')
    wrapper.find('.el-button').trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.el-button').text()).toBe('Updated')
  })

  it('should display update error', async () => {
    await updateErrorQuery()
    const wrapper = mount(SystemHealthPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    wrapper.vm.mode = 2
    await nextTick()

    expect(wrapper.find('.el-button').text()).toBe('Update')
    wrapper.find('.el-button').trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.el-button').text()).toBe('Error')
  })
})
