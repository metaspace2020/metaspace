import { nextTick, ref } from 'vue'
import router from '../../router'
import store from '../../store'
import { mount } from '@vue/test-utils'
import MetaspaceHeader from './MetaspaceHeader'
import { expect, vi, beforeEach } from 'vitest'
import { clearUserId, setUserId } from '../../lib/gtag'

vi.mock('../../lib/gtag', () => ({
  setUserId: vi.fn(),
  clearUserId: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(setUserId).mockClear()
  vi.mocked(clearUserId).mockClear()
})

const currentUserMockResponses = [
  {
    data: {
      currentUser: {
        id: '123',
        name: 'Test UserX',
        email: 'test@example.com',
        primaryGroup: {
          group: {
            id: '456',
            name: 'Test Group',
            urlSlug: null,
          },
        },
        groups: [
          { role: 'MEMBER', group: { hasPendingRequest: null } },
          { role: 'GROUP_ADMIN', group: { hasPendingRequest: false } },
        ],
        projects: [
          { role: 'PENDING', project: { hasPendingRequest: null } },
          { role: 'MANAGER', project: { hasPendingRequest: true } },
        ],
      },
    },
  },
  {
    data: {
      currentUser: null,
    },
  },
]

let mockIndex = 0 // This will determine which mock response to use

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(() => ({
    result: ref(currentUserMockResponses[mockIndex].data),
    loading: ref(false),
    error: ref(null),
    subscribeToMore: vi.fn(),
  })),
}))

// Mock router's push function or any other function you need
router.push = vi.fn()

describe('MetaspaceHeader', () => {
  it('should match snapshot (logged in)', async () => {
    mockIndex = 0
    const wrapper = mount(MetaspaceHeader, {
      global: {
        plugins: [router, store],
      },
    })

    await nextTick()
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should match snapshot (logged out)', async () => {
    mockIndex = 1
    const wrapper = mount(MetaspaceHeader, {
      global: {
        plugins: [router, store],
      },
    })

    await nextTick()
    expect(wrapper.html()).toMatchSnapshot()
  })
})

describe('MetaspaceHeader analytics identity', () => {
  it('attaches the signed-in user id to analytics once the profile loads', async () => {
    mockIndex = 0
    mount(MetaspaceHeader, { global: { plugins: [router, store] } })
    await nextTick()
    expect(setUserId).toHaveBeenCalledWith('123')
    expect(clearUserId).not.toHaveBeenCalled()
  })

  it('clears the analytics user id when there is no signed-in user', async () => {
    mockIndex = 1
    mount(MetaspaceHeader, { global: { plugins: [router, store] } })
    await nextTick()
    expect(clearUserId).toHaveBeenCalled()
    expect(setUserId).not.toHaveBeenCalled()
  })
})
