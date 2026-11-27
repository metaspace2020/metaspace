import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick, defineComponent, Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useQuery } from '@vue/apollo-composable'
import PaymentPage from './PaymentPage'
import store from '../../store'
import { getPlanQuery } from '../../api/plan'
import { getTopupOptionsQuery, validateCouponQuery } from '../../api/subscription'
import { userProfileQuery } from '../../api/user'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn() })),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: Symbol.for('test-apollo-client'),
}))

vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn().mockResolvedValue(null) }))

const option = (id: string, months: number, cents: number, order: number) => ({
  id,
  periodMonths: months,
  priceCents: cents,
  displayName: months === 12 ? '1 year' : '2 years',
  isActive: true,
  displayOrder: order,
})

const plan = {
  id: 'p1',
  name: 'Essential',
  tier: 'essential',
  type: 'subscription',
  description: '',
  isActive: true,
  isDefault: false,
  displayOrder: 1,
  pricingOptions: [option('y1', 12, 99900, 1), option('y2', 24, 189900, 2)],
  planRules: [],
}

const validResult = {
  isValid: true,
  couponCode: 'ESSENTIALPROMO2',
  message: null,
  originalPriceCents: 189900,
  discountedPriceCents: 113940,
  discountAmountCents: 75960,
  discountPercentage: 40,
  couponName: 'Black Friday',
}

let planResult: Ref<{ plan?: typeof plan }>
let userResult: Ref<{ currentUser?: unknown }>
let query: ReturnType<typeof vi.fn>

const mountPage = async (url: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/payment', component: defineComponent({ render: () => null }) }],
  })
  await router.push(url)
  await router.isReady()
  const wrapper = mount(PaymentPage, {
    global: { plugins: [store, router], provide: { [Symbol.for('test-apollo-client')]: { query } } },
  })
  await flushPromises()
  // The signed-in user arrives after setup, as it does in the app.
  userResult.value = { currentUser: { id: 'u1', email: 'ada@example.org', name: 'Ada Lovelace', groups: [] } }
  await flushPromises()
  return wrapper
}

const couponCalls = () => query.mock.calls.filter(([arg]) => arg.query === validateCouponQuery)

beforeEach(() => {
  vi.clearAllMocks()
  planResult = ref({ plan })
  userResult = ref({})
  query = vi.fn().mockResolvedValue({ data: { validateCoupon: validResult } })
  ;(useQuery as any).mockImplementation((document: unknown) => {
    const base = { loading: ref(false), onResult: vi.fn(), refetch: vi.fn() }
    if (document === getPlanQuery) {
      return { ...base, result: planResult }
    }
    if (document === userProfileQuery) {
      return { ...base, result: userResult }
    }
    if (document === getTopupOptionsQuery) {
      return { ...base, result: ref({ topupOptions: [] }) }
    }
    return { ...base, result: ref({}) }
  })
})

describe('PaymentPage coupon from the URL', () => {
  it('validates the code once for the pricing option in the URL and shows it as applied', async () => {
    const wrapper = await mountPage('/payment?planId=p1&pricingId=y2&coupon=ESSENTIALPROMO2')
    expect(couponCalls()).toHaveLength(1)
    expect(couponCalls()[0][0]).toEqual({
      query: validateCouponQuery,
      variables: { input: { couponCode: 'ESSENTIALPROMO2', planId: 'p1', pricingId: 'y2' } },
    })
    expect(wrapper.find('.coupon-applied .coupon-code').text()).toBe('ESSENTIALPROMO2')
    expect(wrapper.find('.coupon-input').exists()).toBe(false)
    expect(wrapper.find('.coupon-error').exists()).toBe(false)
  })

  it('waits for a plan that resolves after mount', async () => {
    planResult.value = {}
    const wrapper = await mountPage('/payment?planId=p1&pricingId=y2&coupon=ESSENTIALPROMO2')
    expect(couponCalls()).toHaveLength(0)
    planResult.value = { plan }
    await flushPromises()
    expect(couponCalls()).toHaveLength(1)
    expect(couponCalls()[0][0].variables.input).toEqual({
      couponCode: 'ESSENTIALPROMO2',
      planId: 'p1',
      pricingId: 'y2',
    })
    expect(wrapper.find('.coupon-applied .coupon-code').text()).toBe('ESSENTIALPROMO2')
  })

  it('shows the existing inline error and keeps the field editable when the code is invalid', async () => {
    query.mockResolvedValue({
      data: { validateCoupon: { ...validResult, isValid: false, message: 'This code has expired' } },
    })
    const wrapper = await mountPage('/payment?planId=p1&pricingId=y2&coupon=ESSENTIALPROMO2')
    expect(couponCalls()).toHaveLength(1)
    expect(wrapper.find('.coupon-error').text()).toBe('This code has expired')
    expect(wrapper.find('.coupon-applied').exists()).toBe(false)
    const input = wrapper.find('.coupon-field input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('ESSENTIALPROMO2')
    expect((input.element as HTMLInputElement).disabled).toBe(false)
    await input.setValue('OTHER')
    expect((input.element as HTMLInputElement).value).toBe('OTHER')
    expect(couponCalls()).toHaveLength(1)
  })

  it('shows the existing inline error when validation returns nothing', async () => {
    query.mockResolvedValue({ data: { validateCoupon: null } })
    const wrapper = await mountPage('/payment?planId=p1&pricingId=y2&coupon=ESSENTIALPROMO2')
    expect(couponCalls()).toHaveLength(1)
    expect(wrapper.find('.coupon-error').text()).toBe('Failed to validate coupon. Please try again.')
    expect(wrapper.find('.coupon-field input').exists()).toBe(true)
  })

  it('does not validate again after Remove when the plan refetches', async () => {
    const wrapper = await mountPage('/payment?planId=p1&pricingId=y2&coupon=ESSENTIALPROMO2')
    expect(couponCalls()).toHaveLength(1)
    await wrapper.find('.remove-coupon').trigger('click')
    expect(wrapper.find('.coupon-input').exists()).toBe(true)
    planResult.value = { plan: { ...plan, pricingOptions: plan.pricingOptions.map((po) => ({ ...po })) } }
    await flushPromises()
    await nextTick()
    expect(couponCalls()).toHaveLength(1)
    expect((wrapper.find('.coupon-field input').element as HTMLInputElement).value).toBe('')
  })

  it('does not validate anything without a coupon and selects the first period', async () => {
    const wrapper = await mountPage('/payment?planId=p1')
    expect(couponCalls()).toHaveLength(0)
    await wrapper.find('.coupon-field input').setValue('TYPED')
    await wrapper.find('.apply-coupon-btn').trigger('click')
    await flushPromises()
    expect(couponCalls()).toHaveLength(1)
    expect(couponCalls()[0][0].variables.input).toEqual({ couponCode: 'TYPED', planId: 'p1', pricingId: 'y1' })
  })

  it('selects the period named by pricingId alone and validates nothing', async () => {
    planResult.value = {}
    const wrapper = await mountPage('/payment?planId=p1&pricingId=y2')
    planResult.value = { plan }
    await flushPromises()
    expect(couponCalls()).toHaveLength(0)
    await wrapper.find('.coupon-field input').setValue('TYPED')
    await wrapper.find('.apply-coupon-btn').trigger('click')
    await flushPromises()
    expect(couponCalls()[0][0].variables.input.pricingId).toBe('y2')
  })
})
