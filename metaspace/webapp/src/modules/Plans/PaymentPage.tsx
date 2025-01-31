import { defineComponent, ref, computed, onMounted, watch, reactive } from 'vue'
import { loadStripe } from '@stripe/stripe-js'
import type { Stripe, StripeElements, StripeCardElement } from '@stripe/stripe-js'
import config from '../../lib/config'
import { ElButton, ElInput, ElSelect, ElOption } from '../../lib/element-plus'
import { useQuery } from '@vue/apollo-composable'
import { currentUserRoleQuery } from '../../api/user'
import { useStore } from 'vuex'
import { useRoute } from 'vue-router'
import { uniqBy } from 'lodash-es'
import { getPlanQuery, Plan } from '../../api/plan'
import './PaymentPage.scss'

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

interface PhoneCode {
  id: string
  country: string
  iso2: string
  flag: string
}

export default defineComponent({
  name: 'PaymentPage',
  setup() {
    const store = useStore()
    const route = useRoute()
    const cardElementRef = ref<HTMLElement | null>(null)

    const state = reactive({
      form: {
        email: '',
        nameOnCard: '',
        city: '',
        address: '',
        zipCode: '',
        selectedCountry: '',
        selectedState: '',
        selectedPhoneCode: '',
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
      cardElement: null as StripeCardElement | null,
      stripe: null as Stripe | null,
      elements: null as StripeElements | null,
      lists: {
        countries: [] as Country[],
        states: [] as State[],
        phoneCodes: [] as PhoneCode[],
      },
      isFetchFailed: false,
    })
    const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/

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
        const response = await fetch(`${config.order_service_url}api/geo/countries`)
        const data = await response.json()

        // Sort countries and ensure United States is first
        const sortedCountries = data
          .filter((country: Country) => country.name !== 'United States')
          .sort((a: Country, b: Country) => a.name?.localeCompare(b?.name))

        const usCountry = data.find((country: Country) => country.name === 'United States')
        state.lists.countries = usCountry ? [usCountry, ...sortedCountries] : sortedCountries

        if (usCountry) {
          state.form.selectedPhoneCode = usCountry.phonecode
        }

        state.isFetchFailed = false
      } catch (error) {
        console.error('Error fetching countries:', error)
        state.isFetchFailed = true
      }
    }

    const fetchStates = async (countryId: string) => {
      try {
        const response = await fetch(`${config.order_service_url}api/geo/countries/${countryId}/states`)
        const data = await response.json()
        state.lists.states = data.sort((a: State, b: State) => a.name.localeCompare(b.name))
      } catch (error) {
        console.error('Error fetching states:', error)
        state.lists.states = []
      }
    }

    const fetchPhoneCodes = async () => {
      try {
        const response = await fetch(`${config.order_service_url}api/geo/phonecodes`)
        const data = await response.json()

        // Sort phone codes and ensure US is first
        const sortedPhoneCodes = data
          .filter((code: PhoneCode) => code.country !== 'United States')
          .sort((a: PhoneCode, b: PhoneCode) => a?.country?.localeCompare(b?.country))

        const usPhoneCode = data.find((code: PhoneCode) => code.country === 'United States')
        state.lists.phoneCodes = usPhoneCode ? [usPhoneCode, ...sortedPhoneCodes] : sortedPhoneCodes
      } catch (error) {
        console.error('Error fetching phone codes:', error)
        state.lists.phoneCodes = []
      }
    }

    watch(
      () => state.form.selectedCountry,
      (newCountryId) => {
        if (newCountryId) {
          fetchStates(newCountryId)
          state.form.selectedState = ''
          const country = state.lists.countries.find((c) => c.id === newCountryId)
          if (country) {
            state.form.selectedPhoneCode = country.phonecode
          }
          state.zipCodeError = null
        } else {
          state.lists.states = []
          state.form.selectedState = ''
        }
      }
    )

    watch(
      () => state.form.zipCode,
      () => {
        if (state.form.selectedCountry) {
          validateUSZipCode()
        }
      }
    )

    onMounted(async () => {
      await fetchCountries()
      await fetchPhoneCodes()
      try {
        const stripeInstance = await loadStripe(config.stripe_pub)
        if (!stripeInstance) {
          throw new Error('Failed to load Stripe')
        }

        state.stripe = stripeInstance
        const elementsInstance = stripeInstance.elements()
        state.elements = elementsInstance

        // wait for the cardElementRef to be available
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

      // Reset all errors
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

        // Create order first
        const orderResponse = await fetch(`${config.order_service_url}api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: Math.random().toString(36).substring(2, 15),
            user_id: currentUser.value?.id,
            type: 'standard',
            total_amount: 1,
            currency: 'usd',
            items: [
              {
                product_id: 'prod_123',
                quantity: 1,
                unit_price: 100,
                name: 'Product Name',
                metadata: {
                  start_date: new Date().toISOString(),
                  end_date: new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 30).toISOString(),
                },
              },
            ],
            custom_metadata: {},
          }),
        })

        if (!orderResponse.ok) {
          throw new Error('Failed to create order')
        }

        const order = await orderResponse.json()

        const selectedState = state.lists.states.find((s) => s.id === state.form.selectedState)
        const selectedCountry = state.lists.countries.find((c) => c.id === state.form.selectedCountry)

        // Create token with additional address info
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

        // Make payment
        const response = await fetch(`${config.order_service_url}api/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: order.total_amount,
            order_id: order.id,
            stripe_token: token.id,
            currency: order.currency,
            description: 'Payment for order',
            custom_metadata: {
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
          }),
        })

        if (!response.ok) {
          throw new Error('Payment processing failed. Please try again.')
        }
      } catch (err: any) {
        console.error('Error processing payment:', err)
        state.error = 'Payment processing failed. Please try again.'
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
                  allowCreate
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
                  <ElSelect
                    modelValue={state.form.selectedPhoneCode}
                    onUpdate:modelValue={(val: string) => {
                      state.form.selectedPhoneCode = val
                      state.formErrors.selectedPhoneCode = false
                    }}
                    class={['phone-code-select', state.formErrors.address ? 'error-border' : '']}
                    size="default"
                    placeholder="+1"
                    filterable
                    allowCreate
                    clearable
                    style={{
                      '--el-select-input-focus-border-color': state.formErrors.selectedPhoneCode
                        ? '#f56c6c !important'
                        : '',
                    }}
                  >
                    {uniqBy(state.lists.countries, 'phonecode').map((country) => (
                      <ElOption key={country.id} value={country.phonecode} label={`+${country.phonecode}`} />
                    ))}
                  </ElSelect>
                  <ElInput
                    modelValue={state.form.phoneNumber}
                    onUpdate:modelValue={(val: string) => {
                      state.form.phoneNumber = val.replace(/[^0-9]/g, '')
                      state.formErrors.phoneNumber = false
                    }}
                    placeholder="Phone number"
                    type="tel"
                    size="default"
                    class={state.formErrors.address ? 'error-border' : ''}
                  />
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
                <>
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
                      <>
                        <div class="plan-description" v-html={plan.value.description} />
                      </>
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
                </>
              )}
            </div>
          </div>
        </div>
      )
    }
  },
})
