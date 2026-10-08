import { nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { useQuery } from '@vue/apollo-composable'
import GroupTopup from './GroupTopup'
import store from '../../store'
import router from '../../router'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

// Shapes mirror the manager's /api/usage-credits/topup-options payload, as
// exposed through the topupOptions GraphQL query.
const X10_OPTION = {
  id: 'topup-option-x10',
  displayName: '10 units',
  units: 10,
  priceCents: 33300,
  grants: [
    { actionType: 'create', type: 'dataset', visibility: 'private', amount: 10 },
    { actionType: 'reprocess', type: 'dataset', visibility: 'private', amount: 20 },
  ],
}

describe('GroupTopup', () => {
  const mockOptions = (options: any[], loading = false) => {
    ;(useQuery as any).mockReturnValue({
      result: ref({ topupOptions: options }),
      loading: ref(loading),
      onResult: vi.fn(),
    })
  }

  const renderTopup = async (options: any[], loading = false) => {
    mockOptions(options, loading)
    const wrapper = mount(GroupTopup, {
      global: { plugins: [store, router] },
      props: { groupId: 'gr1' },
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should hide the feature entirely when the plan is not top-uppable', async () => {
    const wrapper = await renderTopup([])

    expect(wrapper.find('[data-test="group-topup"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Top up')
  })

  it('should render each option with its price and full credit bundle', async () => {
    const wrapper = await renderTopup([X10_OPTION])

    const option = wrapper.find('[data-test="topup-option"]')
    expect(option.exists()).toBe(true)
    expect(option.text()).toContain('10 units')
    expect(option.text()).toContain('$333')
    // The bundle comes from the API, never hardcoded: both grants render.
    expect(option.text()).toContain('+10 private submissions')
    expect(option.text()).toContain('+20 private resubmissions')
  })

  it('should render one purchasable card per option', async () => {
    const wrapper = await renderTopup([
      X10_OPTION,
      { ...X10_OPTION, id: 'topup-option-x15', displayName: '15 units', priceCents: 49900 },
    ])

    expect(wrapper.findAll('[data-test="topup-option"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-test="buy-topup"]')).toHaveLength(2)
  })

  it('should send the buyer to the payment page scoped to this option and group', async () => {
    const push = vi.spyOn(router, 'push').mockResolvedValue(undefined as any)
    const wrapper = await renderTopup([X10_OPTION])

    await wrapper.find('[data-test="buy-topup"]').trigger('click')

    expect(push).toHaveBeenCalledWith({
      path: '/payment',
      query: { topupOptionId: 'topup-option-x10', groupId: 'gr1' },
    })
  })
})
