import { mount, flushPromises } from '@vue/test-utils'
import BetaActivationPage from './BetaActivationPage.vue'
import router from '../../router'
import { useMutation, useApolloClient } from '@vue/apollo-composable'

vi.mock('@vue/apollo-composable', () => ({
  useMutation: vi.fn(),
  useApolloClient: vi.fn(),
}))

describe('BetaActivationPage', () => {
  const mockMutate = vi.fn()
  const mockClientQuery = vi.fn().mockResolvedValue({})

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useMutation as any).mockReturnValue({ mutate: mockMutate })
    ;(useApolloClient as any).mockReturnValue({ client: { query: mockClientQuery } })
  })

  const mountAt = async (query: string) => {
    await router.push(`/beta-testers/activate${query}`)
    await router.isReady()
    const wrapper = mount(BetaActivationPage, {
      global: { plugins: [router], directives: { loading: {} } },
    })
    await flushPromises()
    return wrapper
  }

  it('renders the success state and refreshes the whitelist', async () => {
    mockMutate.mockResolvedValueOnce({ data: { activateBetaTester: 'success' } })

    const wrapper = await mountAt('?token=abc')

    expect(mockMutate).toHaveBeenCalledWith({ token: 'abc' })
    expect(wrapper.text()).toContain('Access activated')
    expect(mockClientQuery).toHaveBeenCalledWith(expect.objectContaining({ fetchPolicy: 'network-only' }))
  })

  it('renders the already-active state without refreshing the whitelist', async () => {
    mockMutate.mockResolvedValueOnce({ data: { activateBetaTester: 'already-active' } })

    const wrapper = await mountAt('?token=abc')

    expect(wrapper.text()).toContain('Already activated')
    expect(mockClientQuery).not.toHaveBeenCalled()
  })

  it('renders the invalid state for a rejected token', async () => {
    mockMutate.mockResolvedValueOnce({ data: { activateBetaTester: 'invalid' } })

    const wrapper = await mountAt('?token=abc')

    expect(wrapper.text()).toContain('Invalid activation link')
  })

  it('renders the invalid state without calling the API when the token is missing', async () => {
    const wrapper = await mountAt('')

    expect(mockMutate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Invalid activation link')
  })

  it('forwards override params from the emailed link', async () => {
    mockMutate.mockResolvedValueOnce({ data: { activateBetaTester: 'success' } })

    await mountAt('?token=abc&features=diffAnalysis%2Csegmentation&startDate=2026-08-04T00%3A00%3A00.000Z')

    expect(mockMutate).toHaveBeenCalledWith({
      token: 'abc',
      features: 'diffAnalysis,segmentation',
      startDate: '2026-08-04T00:00:00.000Z',
    })
  })

  it('renders the invalid state when the mutation fails', async () => {
    mockMutate.mockRejectedValueOnce(new Error('network error'))

    const wrapper = await mountAt('?token=abc')

    expect(wrapper.text()).toContain('Invalid activation link')
  })
})
