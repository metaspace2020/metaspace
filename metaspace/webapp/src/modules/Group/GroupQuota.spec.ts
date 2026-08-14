import { nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { useQuery } from '@vue/apollo-composable'
import GroupQuota from './GroupQuota'
import store from '../../store'
import router from '../../router'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

// Shapes mirror real /api/api-usages/group/<id>/remaining-usages payloads.
const CREATE_ROW = {
  actionType: 'create',
  remaining: 0,
  limit: 5,
  period: 1,
  periodType: 'month',
  creditsTotal: 0,
  creditsUsed: 0,
  creditsRemaining: 0,
}

describe('GroupQuota', () => {
  const mockQuota = (rows: any[], loading = false) => {
    ;(useQuery as any).mockReturnValue({
      result: ref({ remainingApiUsages: rows }),
      loading: ref(loading),
      onResult: vi.fn(),
    })
  }

  const headers = (wrapper: any) => wrapper.findAll('thead th').map((th: any) => th.text())

  const renderQuota = async (rows: any[]) => {
    mockQuota(rows)
    const wrapper = mount(GroupQuota, {
      global: { plugins: [store, router] },
      props: { groupId: 'gr1', types: ['create'] },
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should report a row with no quota and no credits as exhausted', async () => {
    const wrapper = await renderQuota([CREATE_ROW])

    expect(wrapper.text()).toContain('Exhausted')
    expect(wrapper.text()).not.toContain('extra credits')
  })

  it('should report a row as available when credits cover an exhausted quota', async () => {
    const wrapper = await renderQuota([
      { ...CREATE_ROW, remaining: 0, creditsRemaining: 1, creditsUsed: 1, creditsTotal: 2 },
    ])

    expect(wrapper.text()).toContain('Available')
    expect(wrapper.text()).not.toContain('Exhausted')
  })

  it('should describe how many extra credits have been used', async () => {
    const wrapper = await renderQuota([
      { ...CREATE_ROW, remaining: 0, creditsRemaining: 1, creditsUsed: 1, creditsTotal: 2 },
    ])

    expect(wrapper.text()).toContain('1/2 extra credits used')
  })

  it('should render the credits note on its own line', async () => {
    const wrapper = await renderQuota([
      { ...CREATE_ROW, remaining: 0, creditsRemaining: 1, creditsUsed: 1, creditsTotal: 2 },
    ])

    expect(wrapper.find('.credits-note').text()).toBe('1/2 extra credits used')
  })

  // The Action and Period columns already show these; repeating them wrapped the cell
  // onto six broken lines in the narrow /upload layout.
  it('should not repeat the action type or period in the description', async () => {
    const wrapper = await renderQuota([{ ...CREATE_ROW, remaining: 3 }])

    expect(wrapper.find('.quota-note').text()).toBe('3 of 5 remaining')
    expect(wrapper.text()).not.toContain('remaining for 1 month')
    expect(wrapper.text()).not.toContain('5 private submissions remaining')
  })

  it('should not mention extra credits for a row that has none', async () => {
    const wrapper = await renderQuota([{ ...CREATE_ROW, remaining: 3 }])

    expect(wrapper.text()).toContain('3 of 5 remaining')
    expect(wrapper.text()).not.toContain('extra credits')
  })

  it('should still describe a fully-spent credit grant', async () => {
    const wrapper = await renderQuota([
      { ...CREATE_ROW, remaining: 0, creditsRemaining: 0, creditsUsed: 2, creditsTotal: 2 },
    ])

    expect(wrapper.text()).toContain('2/2 extra credits used')
    expect(wrapper.text()).toContain('Exhausted')
  })

  it('should show the extra credits column only when a grant exists', async () => {
    const withCredits = await renderQuota([{ ...CREATE_ROW, creditsRemaining: 2, creditsTotal: 2 }])
    expect(headers(withCredits)).toContain('Credits')

    const withoutCredits = await renderQuota([CREATE_ROW])
    expect(headers(withoutCredits)).not.toContain('Credits')
  })

  // A group with no grants at all: the API omits the credit fields entirely.
  it('should hide the extra credits column when the row omits the credit fields', async () => {
    const wrapper = await renderQuota([{ actionType: 'create', remaining: 1, limit: 1, period: 1, periodType: 'day' }])

    expect(headers(wrapper)).not.toContain('Credits')
    expect(wrapper.text()).not.toContain('extra credits used')
  })

  // Only one of several rows carrying a grant still warrants the column.
  it('should show the column when any row has a grant', async () => {
    const wrapper = await renderQuota([
      CREATE_ROW,
      { ...CREATE_ROW, actionType: 'update', creditsRemaining: 1, creditsUsed: 0, creditsTotal: 1 },
    ])

    expect(headers(wrapper)).toContain('Credits')
  })
})
