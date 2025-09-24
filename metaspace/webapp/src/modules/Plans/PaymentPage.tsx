import { defineComponent, ref, computed, watch, reactive, inject } from 'vue'
import { loadStripe } from '@stripe/stripe-js'
import type { Stripe, StripeElements } from '@stripe/stripe-js'
import config from '../../lib/config'
import {
  ElButton,
  ElInput,
  ElNotification,
  ElRadioGroup,
  ElRadio,
  ElSelect,
  ElOption,
  ElSwitch,
  ElCheckbox,
  ElDialog,
} from '../../lib/element-plus'
import { useQuery, DefaultApolloClient } from '@vue/apollo-composable'
import { currentUserRoleWithGroupQuery } from '../../api/user'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { getPlanQuery, Plan } from '../../api/plan'
import './PaymentPage.scss'
import { Fragment } from 'vue'
import { createSubscriptionMutation, validateCouponQuery } from '../../api/subscription'
import {
  formatPrice,
  getMonthlyPriceFromCents,
  getBillingInterval,
  getSavingsPercentageFromPrices,
} from '../../lib/pricing'
import { STRIPE_SUPPORTED_COUNTRIES, countryRequiresPostalCode } from '../../lib/countries'

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
    const cardNumberRef = ref<HTMLElement | null>(null)
    const cardExpiryRef = ref<HTMLElement | null>(null)
    const cardCvcRef = ref<HTMLElement | null>(null)
    // Inject Apollo client
    const apolloClient = inject(DefaultApolloClient)

    const state = reactive({
      selectedPeriod: null as any,
      autoRenew: true,
      form: {
        groupId: '',
        email: '',
        firstName: '',
        lastName: '',
        address: '',
        zipCode: '',
        selectedCountry: 'US', // Default to US
        selectedState: '',
        selectedPhoneCode: '+1', // Default to +1 (US)
        phoneNumber: '',
      },
      coupon: {
        code: '',
        applied: false,
        discount: 0,
        error: null as string | null,
        validationResult: null as any,
        isValidating: false,
      },
      formErrors: {
        email: false,
        firstName: false,
        lastName: false,
        address: false,
        zipCode: false,
        selectedCountry: false,
        selectedState: false,
        selectedPhoneCode: false,
        phoneNumber: false,
      },
      validation: {
        email: { isValid: false, message: '' },
        firstName: { isValid: false, message: '' },
        lastName: { isValid: false, message: '' },
        address: { isValid: false, message: '' },
        zipCode: { isValid: false, message: '' },
        cardNumber: { isValid: false, message: '' },
        cardExpiry: { isValid: false, message: '' },
        cardCvc: { isValid: false, message: '' },
      },
      loading: false,
      error: null as string | null,
      zipCodeError: null as string | null,
      phoneCodeError: null as string | null, // Add error for phone code validation
      cardNumberElement: null as any,
      cardExpiryElement: null as any,
      cardCvcElement: null as any,
      stripe: null as Stripe | null,
      elements: null as StripeElements | null,
      lists: {
        countries: [] as Country[],
        states: [] as State[],
      },
      isFetchFailed: false,
      orderId: null as string | null,
      selectedPricingOption: null as any,
      planError: null as string | null,
      termsAccepted: false,
      privacyDpaAccepted: false,
      showModal: false,
      modalContent: {
        title: '',
        url: '',
      },
      savedScrollPosition: 0,
    })
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    // Validation functions
    const validateEmail = (email: string) => {
      if (!email.trim()) {
        state.validation.email = { isValid: false, message: 'Email is required' }
        return false
      }
      if (!EMAIL_REGEX.test(email)) {
        state.validation.email = { isValid: false, message: 'Please enter a valid email address' }
        return false
      }
      state.validation.email = { isValid: true, message: '' }
      return true
    }

    const validateFirstName = (name: string) => {
      if (!name.trim()) {
        state.validation.firstName = { isValid: false, message: 'First name is required' }
        return false
      }
      if (name.trim().length < 2) {
        state.validation.firstName = { isValid: false, message: 'First name must be at least 2 characters' }
        return false
      }
      state.validation.firstName = { isValid: true, message: '' }
      return true
    }

    const validateLastName = (name: string) => {
      if (!name.trim()) {
        state.validation.lastName = { isValid: false, message: 'Last name is required' }
        return false
      }
      if (name.trim().length < 2) {
        state.validation.lastName = { isValid: false, message: 'Last name must be at least 2 characters' }
        return false
      }
      state.validation.lastName = { isValid: true, message: '' }
      return true
    }

    const validateAddress = (address: string) => {
      if (!address.trim()) {
        state.validation.address = { isValid: false, message: 'Address is required' }
        return false
      }
      if (address.trim().length < 4) {
        state.validation.address = { isValid: false, message: 'Please enter a complete address' }
        return false
      }
      state.validation.address = { isValid: true, message: '' }
      return true
    }

    const validateZipCode = (zipCode: string) => {
      const isRequired = countryRequiresPostalCode(state.form.selectedCountry)

      if (isRequired && !zipCode.trim()) {
        state.validation.zipCode = { isValid: false, message: 'Postal code is required for this country' }
        return false
      }

      if (zipCode.trim() && zipCode.trim().length < 3) {
        state.validation.zipCode = { isValid: false, message: 'Please enter a valid postal code' }
        return false
      }

      state.validation.zipCode = { isValid: true, message: '' }
      return true
    }

    // Computed property to check if form is valid
    const isFormValid = computed(() => {
      const postalCodeValid = countryRequiresPostalCode(state.form.selectedCountry)
        ? state.validation.zipCode.isValid
        : true

      return (
        state.validation.email.isValid &&
        state.validation.firstName.isValid &&
        state.validation.lastName.isValid &&
        state.validation.address.isValid &&
        postalCodeValid &&
        state.form.selectedCountry && // Country is required
        state.validation.cardNumber.isValid &&
        state.validation.cardExpiry.isValid &&
        state.validation.cardCvc.isValid &&
        state.termsAccepted &&
        state.privacyDpaAccepted
      )
    })

    const { result: currentUserResult, onResult } = useQuery<CurrentUserRoleResult>(
      currentUserRoleWithGroupQuery,
      null,
      {
        fetchPolicy: 'network-only',
      }
    )
    const currentUser = computed(() => currentUserResult.value?.currentUser)
    const groups = computed(
      () =>
        (currentUser.value as any)?.groups.map((group: any) => ({
          ...group.group,
        }))
    )

    const planQueryVariables = computed(() => ({
      planId: route.query?.planId as string,
      includeVat: true,
      customerCountry: state.form.selectedCountry,
      customerPostalCode: state.form.zipCode,
    }))

    const { result: planResult, refetch: refetchPlan } = useQuery<{ plan: Plan }>(getPlanQuery, planQueryVariables, {
      fetchPolicy: 'network-only',
    })
    const plan = computed(() => {
      const planData = planResult.value?.plan
      return planData
    })

    // Get all unique periods from the plan
    const availablePeriods = computed(() => {
      if (!plan.value?.pricingOptions?.length) return []

      const periods = plan.value.pricingOptions
        .filter((option) => option.isActive)
        .sort((a, b) => {
          return a.displayOrder - b.displayOrder
        })

      return periods
    })

    const getTotalPrice = (pricingOption: any) => {
      if (!pricingOption) return 0

      // If VAT calculation is available, use the inclusive VAT price
      if (pricingOption.vatCalculation) {
        return pricingOption.vatCalculation.priceInclusiveVAT
      }

      // Fallback to original price
      return pricingOption.priceCents
    }

    const getBasePrice = (pricingOption: any) => {
      if (!pricingOption) return 0

      // If VAT calculation is available, use the exclusive VAT price
      if (pricingOption.vatCalculation) {
        return pricingOption.vatCalculation.priceExclusiveVAT
      }

      // Fallback to original price
      return pricingOption.priceCents
    }

    const getVatAmount = (pricingOption: any) => {
      if (!pricingOption?.vatCalculation) return 0
      return pricingOption.vatCalculation.vatAmount
    }

    const getTotalDiscountAmount = () => {
      if (!state.coupon.applied || !state.coupon.validationResult?.isValid) {
        return 0
      }

      // Return just the base discount amount (VAT is shown separately)
      return state.coupon.validationResult.discountAmountCents || 0
    }

    const finalPrice = computed(() => {
      const basePrice = getTotalPrice(state.selectedPeriod)

      if (state.coupon.applied && state.coupon.validationResult?.isValid) {
        // If we have VAT calculation: Base - Discount + VAT (on original base)
        if (state.selectedPeriod?.vatCalculation) {
          const originalBasePrice = getBasePrice(state.selectedPeriod)
          const discountAmount = state.coupon.validationResult.discountAmountCents || 0
          const originalVatAmount = getVatAmount(state.selectedPeriod)
          return originalBasePrice - discountAmount + originalVatAmount
        } else {
          // No VAT calculation, use discounted price directly
          return state.coupon.validationResult.discountedPriceCents || basePrice
        }
      }

      return basePrice
    })

    // Update selected pricing option when period changes
    watch(
      () => state.selectedPeriod,
      (newPeriod) => {
        // selectedPeriod is now the pricing option object itself
        state.selectedPricingOption = newPeriod
      },
      { immediate: true }
    )

    // Update period when pricingId changes from URL
    watch(
      () => route.query.pricingId,
      (newPriceId) => {
        if (newPriceId && plan.value?.pricingOptions) {
          const option = plan.value.pricingOptions.find((po) => po.id === newPriceId)
          if (option) {
            state.selectedPeriod = option
          }
        }
      },
      { immediate: true }
    )

    // Set default selected period when plan loads
    watch(
      () => availablePeriods.value,
      (newPeriods) => {
        if (newPeriods.length > 0 && !state.selectedPeriod) {
          // Default to the first available period (usually monthly)
          state.selectedPeriod = newPeriods[0]
        } else if (newPeriods.length > 0 && state.selectedPeriod) {
          // Update the selected period with fresh data (important for VAT updates)
          const currentSelectedId = state.selectedPeriod.id
          const updatedPeriod = newPeriods.find((period) => period.id === currentSelectedId)
          if (updatedPeriod) {
            state.selectedPeriod = updatedPeriod
          }
        }
      },
      { immediate: true }
    )

    // Debounced refetch function
    let refetchTimeout: NodeJS.Timeout | null = null
    const debouncedRefetch = () => {
      if (refetchTimeout) {
        clearTimeout(refetchTimeout)
      }
      refetchTimeout = setTimeout(() => {
        if (route.query?.planId && state.form.selectedCountry) {
          refetchPlan()
        }
      }, 500)
    }

    // Refetch plan when country or postal code changes (for VAT calculation)
    watch(
      () => [state.form.selectedCountry, state.form.zipCode],
      () => {
        //
        debouncedRefetch()
      }
    )

    const applyCoupon = async () => {
      if (!state.coupon.code.trim()) {
        state.coupon.error = 'Please enter a coupon code'
        return
      }

      if (!apolloClient) {
        state.coupon.error = 'Unable to validate coupon. Please try again.'
        return
      }

      if (!plan.value?.id || !state.selectedPricingOption?.id) {
        state.coupon.error = 'Plan information not available'
        return
      }

      state.coupon.isValidating = true
      state.coupon.error = null

      try {
        const { data } = await apolloClient.query({
          query: validateCouponQuery,
          variables: {
            input: {
              couponCode: state.coupon.code,
              planId: plan.value.id,
              pricingId: state.selectedPricingOption.id,
            },
          },
        })

        state.coupon.validationResult = data.validateCoupon
        state.coupon.applied = data.validateCoupon.isValid

        if (!data.validateCoupon.isValid) {
          state.coupon.error = data.validateCoupon.message || 'Invalid coupon code'
        }
      } catch (error) {
        state.coupon.error = 'Failed to validate coupon. Please try again.'
        state.coupon.applied = false
      } finally {
        state.coupon.isValidating = false
      }
    }

    const removeCoupon = () => {
      state.coupon.applied = false
      state.coupon.discount = 0
      state.coupon.code = ''
      state.coupon.error = null
      state.coupon.validationResult = null
    }

    const openModal = (title: string, url: string) => {
      // Save current scroll position
      state.savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop
      state.modalContent.title = title
      state.modalContent.url = url
      state.showModal = true
    }

    const closeModal = () => {
      state.showModal = false
      state.modalContent.title = ''
      state.modalContent.url = ''
      // Restore scroll position after modal closes
      setTimeout(() => {
        window.scrollTo(0, state.savedScrollPosition)
      }, 0)
    }

    watch(
      () => currentUserResult.value?.currentUser,
      (newUser) => {
        if (newUser) {
          // Only initialize Stripe when user is authenticated
          initializeStripe()
          // Pre-fill email if available
          const email = newUser.email || ''
          state.form.email = email
          if (email) {
            validateEmail(email)
          }
        }
      },
      { immediate: true }
    )

    onResult((result) => {
      const { data } = result
      if (data && data.currentUser == null) {
        state.stripe = null
        state.elements = null
        state.cardNumberElement = null
        state.cardExpiryElement = null
        state.cardCvcElement = null

        store.commit('account/showDialog', {
          dialog: 'signIn',
          dialogCloseRedirect: '/plans',
          loginSuccessRedirect: `/payment?planId=${route.query.planId}`,
        })
      }
    })

    const initializeStripe = async () => {
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
        while (!cardNumberRef.value && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          attempts++
        }

        if (!cardNumberRef.value) {
          throw new Error('Card element container not found after multiple attempts')
        }

        const baseStyle = {
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
        }

        const cardNumber = (elementsInstance as any).create('cardNumber', { style: baseStyle })
        const cardExpiry = (elementsInstance as any).create('cardExpiry', { style: baseStyle })
        const cardCvc = (elementsInstance as any).create('cardCvc', { style: baseStyle })

        // Wait for all refs to be ready
        let refAttempts = 0
        const maxRefAttempts = 10
        while ((!cardExpiryRef.value || !cardCvcRef.value) && refAttempts < maxRefAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          refAttempts++
        }

        cardNumber.mount(cardNumberRef.value)
        cardExpiry.mount(cardExpiryRef.value)
        cardCvc.mount(cardCvcRef.value)

        state.cardNumberElement = cardNumber
        state.cardExpiryElement = cardExpiry
        state.cardCvcElement = cardCvc

        const handleCardNumberChange = (event: any) => {
          if (event.error) {
            state.validation.cardNumber = { isValid: false, message: event.error.message }
            state.error = event.error.message
          } else {
            state.validation.cardNumber = { isValid: event.complete || false, message: '' }
            if (!event.complete) {
              state.error = null
            }
          }
        }

        const handleCardExpiryChange = (event: any) => {
          if (event.error) {
            state.validation.cardExpiry = { isValid: false, message: event.error.message }
            state.error = event.error.message
          } else {
            state.validation.cardExpiry = { isValid: event.complete || false, message: '' }
            if (!event.complete) {
              state.error = null
            }
          }
        }

        const handleCardCvcChange = (event: any) => {
          if (event.error) {
            state.validation.cardCvc = { isValid: false, message: event.error.message }
            state.error = event.error.message
          } else {
            state.validation.cardCvc = { isValid: event.complete || false, message: '' }
            if (!event.complete) {
              state.error = null
            }
          }
        }

        cardNumber.on('change', handleCardNumberChange)
        cardExpiry.on('change', handleCardExpiryChange)
        cardCvc.on('change', handleCardCvcChange)
      } catch (err: any) {
        console.error('Error initializing Stripe:', err)
        state.error = err.message || 'Failed to initialize payment system'
      }
    }

    const handleSubmit = async () => {
      if (!state.stripe || !state.cardNumberElement) {
        ElNotification({
          title: 'Error',
          message: 'Payment system not initialized. Please refresh the page.',
          type: 'error',
        })
        return
      }

      if (!isFormValid.value || !state.selectedPricingOption) {
        ElNotification({
          title: 'Error',
          message: 'Please fill in all required fields correctly',
          type: 'error',
        })
        return
      }

      state.loading = true
      state.error = null

      try {
        // Validate required data
        if (!apolloClient) {
          throw new Error('Apollo client not available')
        }

        if (!currentUser.value?.id) {
          throw new Error('User authentication required')
        }

        if (!route.query.planId) {
          throw new Error('Plan ID is required')
        }

        const { paymentMethod, error: paymentMethodError } = await state.stripe!.createPaymentMethod({
          type: 'card',
          card: state.cardNumberElement,
          billing_details: {
            name: `${state.form.firstName} ${state.form.lastName}`,
            email: state.form.email,
            address: {
              ...(state.form.address && { line1: state.form.address }),
              ...(state.form.zipCode && { postal_code: state.form.zipCode }),
              ...(state.form.selectedCountry && { country: state.form.selectedCountry }),
            },
          },
        })

        if (paymentMethodError) {
          throw new Error(paymentMethodError.message)
        }

        if (!paymentMethod) {
          throw new Error('Failed to create payment method')
        }

        // Create subscription with the token
        const { data } = await apolloClient!.mutate({
          mutation: createSubscriptionMutation,
          variables: {
            input: {
              userId: currentUser.value?.id,
              planId: plan.value!.id,
              groupId: state.form.groupId,
              pricingId: state.selectedPricingOption.id,
              address: {
                line1: state.form.address,
                postalCode: state.form.zipCode,
                country: state.form.selectedCountry,
              },
              email: state.form.email,
              name: `${state.form.firstName} ${state.form.lastName}`.trim(),
              billingInterval: getBillingInterval(state.selectedPeriod),
              paymentMethodId: paymentMethod!.id,
              couponCode: state.coupon.applied ? state.coupon.code : undefined,
              autoRenew: state.autoRenew,
            },
          },
        })
        console.log('debug', data.createSubscription)
        if (data?.createSubscription) {
          state.orderId = data?.createSubscription
          
          try {
            router.push({
              name: 'success',
              query: {
                subscriptionId: data.createSubscription.id,
              },
            })
          } catch (routerError) {
            console.warn('Router navigation failed, falling back to window navigation:', routerError)
            window.location.href = `/success?subscriptionId=${data.createSubscription.id}`
            window.location.reload()
          }
        } else {
          console.log('debug error')
          throw new Error('Failed to create subscription')
        }
      } catch (error: any) {
        console.error('Payment error:', error)

        let errorMessage = 'An unexpected error occurred. Please try again.'

        if (error.message) {
          errorMessage = error.message
        } else if (error.graphQLErrors && error.graphQLErrors.length > 0) {
          errorMessage = error.graphQLErrors[0].message
        } else if (error.networkError) {
          errorMessage = 'Network error. Please check your connection and try again.'
        }

        state.error = errorMessage
        ElNotification({
          title: 'Payment Failed',
          message: errorMessage,
          type: 'error',
          duration: 8000,
        })
      } finally {
        state.loading = false
      }
    }

    return () => {
      if (!currentUser.value) return null

      return (
        <div class="payment-page">
          <div class="payment-container">
            <div class="payment-form">
              <h2>Enter payment details</h2>

              {/* Billing Frequency Section */}
              <div class="form-section">
                <h3>Billing Frequency</h3>
                <div class="billing-frequency">
                  <ElRadioGroup
                    modelValue={availablePeriods.value.findIndex((option) => option.id === state.selectedPeriod?.id)}
                    onUpdate:modelValue={(index: number) => {
                      state.selectedPeriod = availablePeriods.value[index]
                    }}
                    class="frequency-options"
                  >
                    {availablePeriods.value.map((period, index) => {
                      const totalPrice = period.priceCents
                      const monthlyPrice = getMonthlyPriceFromCents(period.priceCents, period.periodMonths)
                      const savingsPercentage = getSavingsPercentageFromPrices(
                        monthlyPrice,
                        getMonthlyPriceFromCents(
                          availablePeriods.value[0].priceCents,
                          availablePeriods.value[0].periodMonths
                        )
                      )
                      return (
                        <div class="frequency-option" key={period.id}>
                          <ElRadio label={index} class="frequency-radio">
                            <div class="option-content">
                              <div class="option-title">{period.displayName}</div>
                              <div class="option-price">
                                ${formatPrice(totalPrice)}/{period.displayName.toLowerCase()}
                                {savingsPercentage > 0 && (
                                  <span class="savings">Save {savingsPercentage.toFixed(1)}%</span>
                                )}
                              </div>
                            </div>
                          </ElRadio>
                        </div>
                      )
                    })}
                  </ElRadioGroup>
                  <div class="autorenew-toggle flex items-center gap-2 mt-10">
                    <label style="font-weight: 500;">Auto-renew</label>
                    <ElSwitch
                      modelValue={state.autoRenew}
                      onUpdate:modelValue={(val: boolean) => (state.autoRenew = val)}
                      activeText="On"
                      inactiveText="Off"
                    />
                  </div>
                </div>
              </div>

              {/* Group Section */}
              <div class="form-section">
                <h3>Group</h3>
                <p>
                  Select a group to associate with this subscription. If you dont have a group, please{' '}
                  <span
                    onClick={() => router.push('/group/create')}
                    class="link text-blue-500 cursor-pointer underline"
                  >
                    create one first
                  </span>
                  .
                </p>
                <ElSelect
                  modelValue={state.form.groupId}
                  onUpdate:modelValue={(val: string) => {
                    state.form.groupId = val
                  }}
                >
                  {groups.value?.map((group) => <ElOption label={group.label} value={group.id} />)}
                </ElSelect>
              </div>

              {/* Customer Information Section */}
              <div class="form-section">
                <h3>Customer Information</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label>
                      Email<span class="required">*</span>
                    </label>
                    <ElInput
                      modelValue={state.form.email}
                      onUpdate:modelValue={(val: string) => {
                        state.form.email = val
                        validateEmail(val)
                        state.formErrors.email = !state.validation.email.isValid
                      }}
                      type="email"
                      placeholder="Enter your email"
                      size="default"
                      class={!state.validation.email.isValid && state.form.email ? 'error-border' : ''}
                    />
                    <div
                      class={`field-error ${
                        !state.validation.email.isValid && state.validation.email.message && state.form.email
                          ? 'visible'
                          : 'invisible'
                      }`}
                    >
                      {state.validation.email.message}
                    </div>
                  </div>

                  <div class="form-group">
                    <label>Phone (optional)</label>
                    <ElInput
                      modelValue={state.form.phoneNumber}
                      onUpdate:modelValue={(val: string) => {
                        state.form.phoneNumber = val.replace(/[^0-9]/g, '')
                        state.formErrors.phoneNumber = false
                      }}
                      placeholder="8143008846"
                      type="tel"
                      size="default"
                      class={state.formErrors.phoneNumber ? 'error-border' : ''}
                    />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>
                      First name<span class="required">*</span>
                    </label>
                    <ElInput
                      modelValue={state.form.firstName}
                      onUpdate:modelValue={(val: string) => {
                        state.form.firstName = val
                        validateFirstName(val)
                        state.formErrors.firstName = !state.validation.firstName.isValid
                      }}
                      placeholder="John"
                      size="default"
                      class={!state.validation.firstName.isValid && state.form.firstName ? 'error-border' : ''}
                    />
                    <div
                      class={`field-error ${
                        !state.validation.firstName.isValid &&
                        state.validation.firstName.message &&
                        state.form.firstName
                          ? 'visible'
                          : 'invisible'
                      }`}
                    >
                      {state.validation.firstName.message}
                    </div>
                  </div>
                  <div class="form-group">
                    <label>
                      Last name<span class="required">*</span>
                    </label>
                    <ElInput
                      modelValue={state.form.lastName}
                      onUpdate:modelValue={(val: string) => {
                        state.form.lastName = val
                        validateLastName(val)
                        state.formErrors.lastName = !state.validation.lastName.isValid
                      }}
                      placeholder="Doe"
                      size="default"
                      class={!state.validation.lastName.isValid && state.form.lastName ? 'error-border' : ''}
                    />
                    <div
                      class={`field-error ${
                        !state.validation.lastName.isValid && state.validation.lastName.message && state.form.lastName
                          ? 'visible'
                          : 'invisible'
                      }`}
                    >
                      {state.validation.lastName.message}
                    </div>
                  </div>
                </div>
              </div>

              <div class="form-section">
                <h3>Billing Address</h3>

                <div class="form-row h-[80px]">
                  <div class="form-group">
                    <label>
                      Country<span class="required">*</span>
                    </label>
                    <ElSelect
                      class="w-full"
                      modelValue={state.form.selectedCountry}
                      onUpdate:modelValue={(val: string) => {
                        state.form.selectedCountry = val
                        state.formErrors.selectedCountry = false
                      }}
                      placeholder="Select your country"
                      size="default"
                      filterable
                    >
                      {STRIPE_SUPPORTED_COUNTRIES.map((country) => (
                        <ElOption key={country.code} label={country.name} value={country.code} />
                      ))}
                    </ElSelect>
                  </div>

                  <div class="form-group">
                    <label>
                      {countryRequiresPostalCode(state.form.selectedCountry) ? 'Postal code' : 'Postal code (optional)'}
                      {countryRequiresPostalCode(state.form.selectedCountry) && <span class="required">*</span>}
                    </label>
                    <ElInput
                      modelValue={state.form.zipCode}
                      onUpdate:modelValue={(val: string) => {
                        state.form.zipCode = val
                        validateZipCode(val)
                        state.formErrors.zipCode = !state.validation.zipCode.isValid
                        state.zipCodeError = null
                      }}
                      placeholder={
                        state.form.selectedCountry === 'US'
                          ? '12345'
                          : state.form.selectedCountry === 'GB'
                          ? 'SW1A 1AA'
                          : state.form.selectedCountry === 'CA'
                          ? 'K1A 0A9'
                          : 'Enter postal code'
                      }
                      size="default"
                      class={!state.validation.zipCode.isValid && state.form.zipCode ? 'error-border' : ''}
                    />
                    <div
                      class={`field-error ${
                        !state.validation.zipCode.isValid && state.validation.zipCode.message && state.form.zipCode
                          ? 'visible'
                          : 'invisible'
                      }`}
                    >
                      {state.validation.zipCode.message}
                    </div>
                    <div class={`field-error zip-error ${state.zipCodeError ? 'visible' : 'invisible'}`}>
                      {state.zipCodeError}
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label>
                    Address<span class="required">*</span>
                  </label>
                  <ElInput
                    modelValue={state.form.address}
                    onUpdate:modelValue={(val: string) => {
                      state.form.address = val
                      validateAddress(val)
                      state.formErrors.address = !state.validation.address.isValid
                    }}
                    placeholder="123 Main Street"
                    size="default"
                    class={!state.validation.address.isValid && state.form.address ? 'error-border' : ''}
                  />
                  <div
                    class={`field-error ${
                      !state.validation.address.isValid && state.validation.address.message && state.form.address
                        ? 'visible'
                        : 'invisible'
                    }`}
                  >
                    {state.validation.address.message}
                  </div>
                </div>
              </div>

              {/* Payment Method Section */}
              <div class="form-section">
                <h3>Payment Method</h3>

                <div class="form-group">
                  <label>Card number</label>
                  <div class="card-input-container">
                    <div class="stripe-element card-number" ref={cardNumberRef}></div>
                    <div class="card-logos">
                      <span class="card-logo visa">VISA</span>
                      <span class="card-logo mc">MC</span>
                      <span class="card-logo amex">AMEX</span>
                    </div>
                  </div>
                  <div class={`field-error ${state.error ? 'visible' : 'invisible'}`}>{state.error}</div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>Expiration date</label>
                    <div class="stripe-element" ref={cardExpiryRef}></div>
                  </div>
                  <div class="form-group">
                    <label>Security code</label>
                    <div class="stripe-element" ref={cardCvcRef}></div>
                  </div>
                </div>
              </div>

              {/* Terms and Privacy Section */}
              <div class="form-section terms-section">
                <div class="terms-checkboxes">
                  <div class="checkbox-item">
                    <ElCheckbox
                      modelValue={state.termsAccepted}
                      onUpdate:modelValue={(val: boolean) => (state.termsAccepted = val)}
                    >
                      I have read and agree to the{' '}
                      <span
                        class="link text-blue-500 cursor-pointer underline"
                        onClick={(e: MouseEvent) => {
                          e.preventDefault()
                          openModal('Terms of Service', config.urls.terms)
                        }}
                      >
                        Terms of Service
                      </span>
                    </ElCheckbox>
                  </div>
                  <div class="checkbox-item">
                    <ElCheckbox
                      modelValue={state.privacyDpaAccepted}
                      onUpdate:modelValue={(val: boolean) => (state.privacyDpaAccepted = val)}
                    >
                      I have read and agree to the{' '}
                      <span
                        class="link text-blue-500 cursor-pointer underline"
                        onClick={(e: MouseEvent) => {
                          e.preventDefault()
                          openModal('Privacy Policy', config.urls.privacy)
                        }}
                      >
                        Privacy Policy
                      </span>{' '}
                      and{' '}
                      <span
                        class="link text-blue-500 cursor-pointer underline"
                        onClick={(e: MouseEvent) => {
                          e.preventDefault()
                          openModal('Data Processing Agreement', config.urls.dpa)
                        }}
                      >
                        Data Processing Agreement
                      </span>
                    </ElCheckbox>
                  </div>
                </div>
              </div>

              <ElButton
                type="primary"
                class="submit-button"
                loading={state.loading}
                disabled={!isFormValid.value || state.loading}
                onClick={handleSubmit}
                size="large"
              >
                Pay ${formatPrice(finalPrice.value)}
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
                      <span class="amount">{formatPrice(getBasePrice(state.selectedPeriod))}</span>
                      <span class="period">/{state.selectedPeriod?.displayName.toLowerCase()}</span>
                    </span>
                  </div>

                  {/* VAT/Tax breakdown */}
                  {state.selectedPeriod?.vatCalculation && getVatAmount(state.selectedPeriod) > 0 && (
                    <div class="summary-item vat-item">
                      <span class="item-name">VAT</span>
                      <span class="item-price">
                        <span class="currency">$</span>
                        <span class="amount">{formatPrice(getVatAmount(state.selectedPeriod))}</span>
                      </span>
                    </div>
                  )}

                  <div class="summary-details">
                    {plan.value.description && (
                      <Fragment>
                        <div class="plan-description" v-html={plan.value.description} />
                      </Fragment>
                    )}
                  </div>

                  {/* Coupon Section */}
                  <div class="coupon-section">
                    {!state.coupon.applied ? (
                      <div class="coupon-input">
                        <ElInput
                          modelValue={state.coupon.code}
                          onUpdate:modelValue={(val: string) => {
                            state.coupon.code = val
                            state.coupon.error = null
                          }}
                          placeholder="Enter coupon code"
                          size="default"
                          class="coupon-field"
                        />
                        <ElButton
                          type="primary"
                          size="default"
                          onClick={applyCoupon}
                          class="apply-coupon-btn"
                          loading={state.coupon.isValidating}
                          disabled={state.coupon.isValidating}
                        >
                          {state.coupon.isValidating ? 'Validating...' : 'Apply'}
                        </ElButton>
                      </div>
                    ) : (
                      <div class="coupon-applied">
                        <span class="coupon-code">{state.coupon.code}</span>
                        <span class="discount">
                          {state.coupon.validationResult?.discountPercentage
                            ? `-${state.coupon.validationResult.discountPercentage}%`
                            : 'Applied'}
                        </span>
                        <ElButton type="text" size="small" onClick={removeCoupon} class="remove-coupon">
                          Remove
                        </ElButton>
                      </div>
                    )}
                    {state.coupon.error && <div class="coupon-error">{state.coupon.error}</div>}
                  </div>

                  {state.coupon.applied && state.coupon.validationResult?.isValid && (
                    <div class="summary-item discount">
                      <span class="item-name">
                        {state.coupon.validationResult.couponName ||
                          `Discount${
                            state.coupon.validationResult.discountPercentage
                              ? ` (${state.coupon.validationResult.discountPercentage}%)`
                              : ''
                          }`}
                      </span>
                      <span class="item-price discount-amount">
                        -$
                        <span class="amount">{formatPrice(getTotalDiscountAmount())}</span>
                      </span>
                    </div>
                  )}

                  <div class="summary-total">
                    <span>Total</span>
                    <span>
                      <span class="currency">$</span>
                      <span class="amount">{formatPrice(finalPrice.value)}</span>
                      <span class="period">/{state.selectedPeriod?.displayName.toLowerCase()}</span>
                    </span>
                  </div>
                  <p class="vat-notice">
                    {state.selectedPeriod?.vatCalculation && getVatAmount(state.selectedPeriod) > 0
                      ? '*VAT included'
                      : '*VAT included where applicable'}
                  </p>
                </Fragment>
              )}
            </div>
          </div>

          {/* Modal for Terms, Privacy, and DPA */}
          <ElDialog
            modelValue={state.showModal}
            onUpdate:modelValue={(val: boolean) => (state.showModal = val)}
            title={state.modalContent.title}
            width="90%"
            top="5vh"
            lockScroll={false}
            onClose={closeModal}
            class="terms-modal"
          >
            <div class="modal-content">
              <div class="iframe-container">
                <iframe src={state.modalContent.url} class="terms-iframe" style={{ border: 'none' }} />
              </div>
            </div>
            {{
              footer: () => (
                <span class="dialog-footer">
                  <ElButton onClick={closeModal}>Close</ElButton>
                </span>
              ),
            }}
          </ElDialog>
        </div>
      )
    }
  },
})
