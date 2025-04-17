import { defineComponent, ref, computed, onMounted, watch, reactive, inject } from 'vue'
import { loadStripe } from '@stripe/stripe-js'
import type { Stripe, StripeElements, StripeCardElement, Token } from '@stripe/stripe-js'
import config from '../../lib/config'
import { ElButton, ElInput, ElSelect, ElOption, ElNotification } from '../../lib/element-plus'
import { useQuery, DefaultApolloClient } from '@vue/apollo-composable'
import { currentUserRoleQuery } from '../../api/user'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { getPlanQuery, Plan } from '../../api/plan'
import './PaymentPage.scss'
import {
  AllCountriesData,
  getAllCountriesQuery,
  getAllStatesQuery,
  AllStatesData,
  StateFilter,
  Country as GraphQLCountry,
  State as GraphQLState,
  createOrderMutation,
  createPaymentMutation,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  CreateOrderInput,
  CreatePaymentInput,
  OrderItemInput,
} from '../../api/order'
import { Fragment } from 'vue'

interface CurrentUser {
  id: string
  email: string
}

interface CurrentUserRoleResult {
  currentUser: CurrentUser | null
}

interface Country {
  id: string
  name: string
  iso2: string
  phonecode: string
}

interface State {
  id: string
  name: string
  iso2: string
}

export default defineComponent({
  name: 'PaymentPage',
  setup() {
    const store = useStore()
    const route = useRoute()
    const router = useRouter()
    const cardElementRef = ref<HTMLElement | null>(null)
    // Inject Apollo client
    const apolloClient = inject(DefaultApolloClient)

    const state = reactive({
      form: {
        email: '',
        nameOnCard: '',
        city: '',
        address: '',
        zipCode: '',
        selectedCountry: '',
        selectedState: '',
        selectedPhoneCode: '+1', // Default to +1 (US)
        phoneNumber: '',
      },
      formErrors: {
        email: false,
        nameOnCard: false,
        city: false,
        address: false,
        zipCode: false,
        selectedCountry: false,
        selectedState: false,
        selectedPhoneCode: false,
        phoneNumber: false,
      },
      loading: false,
      error: null as string | null,
      zipCodeError: null as string | null,
      phoneCodeError: null as string | null, // Add error for phone code validation
      cardElement: null as StripeCardElement | null,
      stripe: null as Stripe | null,
      elements: null as StripeElements | null,
      lists: {
        countries: [] as Country[],
        states: [] as State[],
      },
      isFetchFailed: false,
      orderId: null as string | null,
    })
    const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/
    const PHONE_CODE_REGEX = /^\+?\d{1,4}$/ // Regex for phone codes: optional + followed by 1-4 digits

    const validateUSZipCode = () => {
      if (
        state.form.selectedCountry &&
        state.lists.countries.find((c) => c.id === state.form.selectedCountry)?.name === 'United States'
      ) {
        if (!US_ZIP_REGEX.test(state.form.zipCode)) {
          state.zipCodeError = 'Please enter a valid US ZIP code'
          return false
        }
      }
      state.zipCodeError = null
      return true
    }

    // Add validation for phone code
    const validatePhoneCode = () => {
      if (!PHONE_CODE_REGEX.test(state.form.selectedPhoneCode)) {
        state.phoneCodeError = 'Please enter a valid country code (e.g. +1)'
        state.formErrors.selectedPhoneCode = true
        return false
      }
      state.phoneCodeError = null
      state.formErrors.selectedPhoneCode = false
      return true
    }

    const { result: currentUserResult, onResult } = useQuery<CurrentUserRoleResult>(currentUserRoleQuery, null, {
      fetchPolicy: 'network-only',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const { result: planResult } = useQuery<{ plan: Plan }>(
      getPlanQuery,
      {
        planId: parseInt(route.query?.planId as string, 10),
      },
      {
        fetchPolicy: 'network-only',
      }
    )
    const plan = computed(() => planResult.value?.plan)

    const { result: countriesResult } = useQuery<AllCountriesData>(getAllCountriesQuery)
    const countries = computed(() => {
      return (countriesResult.value?.allCountries || []).map((country: GraphQLCountry) => ({
        id: country.id,
        name: country.name,
        iso2: country.code || '',
        phonecode: '1',
      }))
    })

    const stateFilter = ref<StateFilter>({})
    const { result: statesResult } = useQuery<AllStatesData>(getAllStatesQuery, () => ({
      filter: stateFilter.value,
    }))
    const states = computed(() => {
      return (statesResult.value?.allStates || []).map((state: GraphQLState) => ({
        id: state.id,
        name: state.name,
        iso2: state.code || '',
      }))
    })

    onResult((result) => {
      const { data } = result
      if (data && data.currentUser == null) {
        store.commit('account/showDialog', {
          dialog: 'signIn',
          dialogCloseRedirect: '/plans',
          loginSuccessRedirect: `/payment?planId=${route.query.planId}`,
        })
      }
    })

    const fetchCountries = async () => {
      try {
        if (countries.value.length > 0) {
          const sortedCountries = countries.value
            .filter((country) => country.name !== 'United States')
            .sort((a, b) => a.name?.localeCompare(b?.name))

          const usCountry = countries.value.find((country) => country.name === 'United States')
          state.lists.countries = usCountry ? [usCountry, ...sortedCountries] : sortedCountries
        }
        state.isFetchFailed = false
      } catch (error) {
        state.isFetchFailed = true
      }
    }

    const fetchStates = async (countryId: string) => {
      try {
        stateFilter.value = { countryId }
      } catch (error) {
        state.lists.states = []
      }
    }

    watch(
      countries,
      (newCountries) => {
        if (newCountries && newCountries.length > 0) {
          fetchCountries()
        }
      },
      { immediate: true }
    )

    watch(
      () => state.form.selectedCountry,
      (newCountryId) => {
        if (newCountryId) {
          fetchStates(newCountryId)
          state.form.selectedState = ''
          state.zipCodeError = null
        } else {
          state.lists.states = []
          state.form.selectedState = ''
        }
      }
    )

    watch(states, (newStates) => {
      if (newStates && newStates.length > 0 && state.form.selectedCountry) {
        state.lists.states = [...newStates].sort((a, b) => a.name.localeCompare(b.name))
      }
    })

    watch(
      () => state.form.zipCode,
      () => {
        if (state.form.selectedCountry) {
          validateUSZipCode()
        }
      }
    )

    watch(
      () => state.form.selectedPhoneCode,
      () => {
        validatePhoneCode()
      }
    )

    onMounted(async () => {
      try {
        const stripeInstance = await loadStripe(config.stripe_pub)
        if (!stripeInstance) {
          throw new Error('Failed to load Stripe')
        }

        state.stripe = stripeInstance
        const elementsInstance = stripeInstance.elements()
        state.elements = elementsInstance

        let attempts = 0
        const maxAttempts = 10
        while (!cardElementRef.value && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          attempts++
        }

        if (!cardElementRef.value) {
          throw new Error('Card element container not found after multiple attempts')
        }

        const card = elementsInstance.create('card', {
          style: {
            base: {
              fontSize: '14px',
              color: '#606266',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              '::placeholder': {
                color: '#c0c4cc',
              },
              iconColor: '#c0c4cc',
            },
            invalid: {
              color: '#f56c6c',
              iconColor: '#f56c6c',
            },
          },
          hidePostalCode: true,
        })

        card.mount(cardElementRef.value)
        state.cardElement = card

        card.on('change', (event) => {
          if (event.error) {
            state.error = event.error.message
          } else {
            state.error = null
          }
        })
      } catch (err: any) {
        console.error('Error initializing Stripe:', err)
        state.error = err.message || 'Failed to initialize payment system'
      }
    })

    const validateForm = () => {
      let isValid = true
      const errors = state.formErrors

      Object.keys(errors).forEach((key) => {
        errors[key as keyof typeof errors] = false
      })

      if (!state.form.email) {
        errors.email = true
        isValid = false
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.form.email)) {
        errors.email = true
        isValid = false
      }

      if (!state.form.nameOnCard) {
        errors.nameOnCard = true
        isValid = false
      }

      if (!state.form.selectedCountry) {
        errors.selectedCountry = true
        isValid = false
      }

      if (!state.form.city) {
        errors.city = true
        isValid = false
      }

      if (!state.form.address) {
        errors.address = true
        isValid = false
      }

      if (!state.form.zipCode) {
        errors.zipCode = true
        isValid = false
      } else if (!validateUSZipCode()) {
        isValid = false
      }

      if (!state.form.selectedPhoneCode) {
        errors.selectedPhoneCode = true
        isValid = false
      } else if (!validatePhoneCode()) {
        isValid = false
      }

      if (!state.form.phoneNumber) {
        errors.phoneNumber = true
        isValid = false
      }

      return isValid
    }

    const handleSubmit = async () => {
      state.loading = true
      state.error = null
      let order = null

      if (!validateForm()) {
        state.loading = false
        return
      }

      try {
        if (!validateUSZipCode()) {
          state.loading = false
          return
        }

        if (!state.stripe || !state.cardElement) {
          throw new Error('Payment system not initialized')
        }

        if (!state.orderId) {
          // Prepare order input data according to GraphQL schema
          const orderInput: CreateOrderInput = {
            userId: currentUser.value?.id || '',
            status: OrderStatus.PENDING,
            planId: plan.value?.id || 1,
            type: 'standard',
            totalAmount: plan.value?.price || 100, // Use actual plan price
            currency: 'usd',
            items: [
              {
                name: plan.value?.name || 'Product Name',
                productId: 'prod_123',
                quantity: 1,
                unitPrice: plan.value?.price || 100,
              } as OrderItemInput,
            ],
            metadata: {
              start_date: new Date().toISOString(),
              end_date: new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 365).toISOString(), // 1 year
            },
          }

          const orderResult = await apolloClient.mutate({
            mutation: createOrderMutation,
            variables: {
              input: orderInput,
            },
          })

          if (!orderResult.data || !orderResult.data.createOrder) {
            throw new Error('Failed to create order')
          }

          order = orderResult.data.createOrder
          state.orderId = order.id
        }

        const selectedState = state.lists.states.find((s) => s.id === state.form.selectedState)
        const selectedCountry = state.lists.countries.find((c) => c.id === state.form.selectedCountry)

        const { token, error: tokenError } = await state.stripe.createToken(state.cardElement, {
          name: state.form.nameOnCard,
          address_line1: state.form.address,
          address_city: state.form.city,
          address_state: selectedState?.name || '',
          address_zip: state.form.zipCode,
          address_country: selectedCountry?.name || '',
        })

        if (tokenError) {
          throw new Error('Payment verification failed.')
        }

        // Type assertion for token
        const stripeToken = token as Token

        // Replace fetch with GraphQL mutation for payment processing
        const paymentInput: CreatePaymentInput = {
          orderId: order.id,
          userId: currentUser.value?.id ? String(currentUser.value.id) : '', // Ensure userId is a string and not null
          amount: order.totalAmount,
          currency: (order.currency || 'usd').toUpperCase().substring(0, 3), // Ensure currency is uppercase and exactly 3 chars
          paymentMethod: PaymentMethod.CREDIT_CARD,
          status: PaymentStatus.PENDING,
          type: 'subscription', // Include the type field directly
          stripeChargeId: stripeToken.id, // Using the Stripe token as transaction ID
          externalReference: stripeToken.card?.last4 ? `Card ending in ${stripeToken.card.last4}` : undefined,
          metadata: {
            email: state.form.email,
            name: state.form.nameOnCard,
            billing_address: {
              street: state.form.address,
              city: state.form.city,
              state: selectedState?.name || '',
              zip: state.form.zipCode,
              country: selectedCountry?.name || '',
            },
            phone: {
              code: state.form.selectedPhoneCode,
              number: state.form.phoneNumber,
            },
          },
        }

        const paymentResult = await apolloClient.mutate({
          mutation: createPaymentMutation,
          variables: {
            input: paymentInput,
          },
        })

        if (!paymentResult.data || !paymentResult.data.createPayment) {
          throw new Error('Payment processing failed. Please try again.')
        }

        router.push('/user/me')
      } catch (err: any) {
        console.error('Error processing payment:', err)
        const errorMessage = JSON.parse(err.message)
        state.error = errorMessage.message || 'Payment processing failed. Please try again.'
        ElNotification.error(state.error)
      } finally {
        state.loading = false
      }
    }

    const formatPrice = (price: number) => {
      return (price / 100).toFixed(2)
    }

    return () => {
      if (!currentUser.value) return null

      return (
        <div class="payment-page">
          <div class="payment-container">
            <div class="payment-form">
              <h2>Enter payment details</h2>

              <div class="form-group">
                <label>
                  Email<span class="required">*</span>
                </label>
                <ElInput
                  modelValue={state.form.email}
                  onUpdate:modelValue={(val: string) => {
                    state.form.email = val
                    state.formErrors.email = false
                  }}
                  type="email"
                  placeholder="Enter your email"
                  size="default"
                  class={state.formErrors.address ? 'error-border' : ''}
                />
              </div>

              <div class="form-group">
                <label>
                  Card information<span class="required">*</span>
                </label>
                <div class="stripe-element" ref={cardElementRef}></div>
              </div>

              <div class="form-group">
                <label>
                  Name on card<span class="required">*</span>
                </label>
                <ElInput
                  modelValue={state.form.nameOnCard}
                  onUpdate:modelValue={(val: string) => {
                    state.form.nameOnCard = val
                    state.formErrors.nameOnCard = false
                  }}
                  placeholder="Enter name on card"
                  size="default"
                  class={state.formErrors.address ? 'error-border' : ''}
                />
              </div>

              <div class="form-group">
                <label>
                  Billing Address<span class="required">*</span>
                </label>
                <ElSelect
                  modelValue={state.form.selectedCountry}
                  onUpdate:modelValue={(val: string) => {
                    state.form.selectedCountry = val
                    state.formErrors.selectedCountry = false
                  }}
                  class={['country-select ', state.formErrors.address ? 'error-border' : '']}
                  size="default"
                  placeholder="Select your country *"
                  filterable
                  clearable
                >
                  {!state.isFetchFailed &&
                    state.lists.countries.map((country) => (
                      <ElOption key={country.id} value={country.id} label={country.name} />
                    ))}
                </ElSelect>

                <ElSelect
                  modelValue={state.form.selectedState}
                  onUpdate:modelValue={(val: string) => {
                    state.form.selectedState = val
                    state.formErrors.selectedState = false
                  }}
                  class="state-select"
                  size="default"
                  placeholder="Select your state"
                  filterable
                  allowCreate
                  clearable
                  disabled={!state.form.selectedCountry}
                >
                  {state.lists.states.map((state) => (
                    <ElOption key={state.id} value={state.id} label={state.name} />
                  ))}
                </ElSelect>

                <ElInput
                  modelValue={state.form.city}
                  onUpdate:modelValue={(val: string) => {
                    state.form.city = val
                    state.formErrors.city = false
                  }}
                  placeholder="City *"
                  size="default"
                  class={['mb-1', state.formErrors.address ? 'error-border' : '']}
                />

                <ElInput
                  modelValue={state.form.address}
                  onUpdate:modelValue={(val: string) => {
                    state.form.address = val
                    state.formErrors.address = false
                  }}
                  placeholder="Street Address *"
                  size="default"
                  class={['mb-1', state.formErrors.address ? 'error-border' : '']}
                />

                <ElInput
                  modelValue={state.form.zipCode}
                  onUpdate:modelValue={(val: string) => {
                    state.form.zipCode = val
                    state.formErrors.zipCode = false
                    state.zipCodeError = null
                  }}
                  placeholder="ZIP Code *"
                  size="default"
                  class={state.formErrors.address ? 'error-border' : ''}
                />
                <div class={['field-error', 'zip-error', state.zipCodeError && 'visible']}>{state.zipCodeError}</div>
              </div>

              <div class="form-group phone-section">
                <label>
                  Phone<span class="required">*</span>
                </label>
                <div class="phone-input-group">
                  <ElInput
                    modelValue={state.form.selectedPhoneCode}
                    onUpdate:modelValue={(val: string) => {
                      state.form.selectedPhoneCode = val
                      state.formErrors.selectedPhoneCode = false
                      state.phoneCodeError = null
                    }}
                    placeholder="+1"
                    class={['phone-code-input', state.formErrors.selectedPhoneCode ? 'error-border' : '']}
                    size="default"
                    maxLength={5} // Limit to 5 characters (+ and up to 4 digits)
                  />
                  <ElInput
                    modelValue={state.form.phoneNumber}
                    onUpdate:modelValue={(val: string) => {
                      state.form.phoneNumber = val.replace(/[^0-9]/g, '')
                      state.formErrors.phoneNumber = false
                    }}
                    placeholder="Phone number"
                    type="tel"
                    size="default"
                    class={state.formErrors.phoneNumber ? 'error-border' : ''}
                  />
                </div>
                <div class={['field-error', 'phone-code-error', state.phoneCodeError && 'visible']}>
                  {state.phoneCodeError}
                </div>
              </div>

              <ElButton
                type="primary"
                class="submit-button"
                loading={state.loading}
                onClick={handleSubmit}
                size="default"
              >
                Pay
              </ElButton>
            </div>

            <div class="order-summary">
              <h2>Order Summary</h2>
              {plan.value && (
                <Fragment>
                  <div class="summary-item">
                    <span class="item-name">{plan.value.name} Plan</span>
                    <span class="item-price">
                      <span class="currency">$</span>
                      <span class="amount">{formatPrice(plan.value.price)}</span>
                      <span class="period">/year</span>
                    </span>
                  </div>
                  <div class="summary-details">
                    {plan.value.description && (
                      <Fragment>
                        <div class="plan-description" v-html={plan.value.description} />
                      </Fragment>
                    )}
                  </div>
                  <div class="summary-total">
                    <span>Total</span>
                    <span>
                      <span class="currency">$</span>
                      <span class="amount">{formatPrice(plan.value.price)}</span>
                      <span class="period">/year</span>
                    </span>
                  </div>
                  <p class="vat-notice">*VAT included where applicable</p>
                </Fragment>
              )}
            </div>
          </div>
        </div>
      )
    }
  },
})
