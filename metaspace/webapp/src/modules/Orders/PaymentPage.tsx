import { defineComponent, ref, onMounted, reactive, nextTick, computed } from 'vue'
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js'
import config from '../../lib/config'
import { ElButton } from '../../lib/element-plus'
import { useQuery } from '@vue/apollo-composable'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import './PaymentPage.scss'

interface Order {
  id: string
  expiresAt: string
  ticket: {
    price: number
  }
}

interface User {
  id: string
  email: string
}

interface PaymentPageState {
  loading: boolean
  error: string | null
  timeLeft: number
  stripe: Stripe | null
  elements: StripeElements | null
  stripePromise: Promise<Stripe | null> | null
  cardElement: any | null
}

export default defineComponent({
  name: 'PaymentPage',
  props: {
    order: {
      type: Object as () => Order,
      default: null,
    },
    currentUser: {
      type: Object as () => User,
      default: null,
    },
  },
  setup() {
    const cardElementRef = ref<HTMLElement | null>(null)
    const state = reactive<PaymentPageState>({
      loading: false,
      error: null,
      timeLeft: 0,
      stripe: null,
      elements: null,
      stripePromise: null,
      cardElement: null,
    })

    const { result: currentUserResult } = useQuery<CurrentUserRoleResult | any>(currentUserRoleQuery, null, {
      fetchPolicy: 'network-only',
    })
    const currentUserId = computed(() => currentUserResult.value?.currentUser?.id)

    // Initialize Stripe
    onMounted(async () => {
      try {
        // Load Stripe
        const stripeInstance = await loadStripe(config.stripe_pub)
        if (!stripeInstance) {
          throw new Error('Failed to load Stripe')
        }

        state.stripe = stripeInstance
        state.stripePromise = Promise.resolve(stripeInstance)

        // Create Elements instance
        const elementsInstance = stripeInstance.elements()
        state.elements = elementsInstance

        // Create and mount the Card Element
        const cardElement = elementsInstance.create('card', {
          style: {
            base: {
              fontSize: '16px',
              color: '#424770',
              '::placeholder': {
                color: '#aab7c4',
              },
            },
            invalid: {
              color: '#9e2146',
            },
          },
        })

        // Wait for next tick to ensure ref is mounted
        await nextTick()
        if (cardElementRef.value) {
          cardElement.mount(cardElementRef.value)
          state.cardElement = cardElement
        }

        // Handle real-time validation errors
        cardElement.on('change', (event) => {
          if (event.error) {
            state.error = event.error.message
          } else {
            state.error = null
          }
        })
      } catch (err) {
        console.error('Error initializing Stripe:', err)
        state.error = 'Failed to load payment system'
      }
    })

    const handleSubmit = async () => {
      state.loading = true
      state.error = null

      try {
        if (!state.stripe || !state.cardElement) {
          throw new Error('Stripe has not been initialized')
        }

        // Create a token
        const { error: stripeError, token } = await state.stripe.createToken(state.cardElement)

        if (stripeError) {
          console.error('Error creating token:', stripeError)
          state.error = stripeError.message
          return
        }

        // Create order first
        const orderResponse = await fetch('http://localhost:3003/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            order_id: Math.random().toString(36).substring(2, 15),
            user_id: currentUserId.value,
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

        // Make API request
        const response = await fetch('http://localhost:3003/api/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: order.total_amount,
            order_id: order.id,
            stripe_token: token.id,
            currency: order.currency,
            description: 'Payment for order',
            custom_metadata: {},
          }),
        })

        if (!response.ok) {
          throw new Error('Payment failed')
        }
        const data = await response.json()
        console.log('response', data.status)

        // Redirect on success
        // router.push('/orders')
      } catch (err) {
        console.error('Error processing payment:', err)
        state.error = 'An error occurred. Please try again.'
      } finally {
        state.loading = false
      }
    }

    return () => {
      return (
        <div>
          {state.stripePromise ? (
            <div class="payment-form">
              <div class="stripe-element">
                <div ref={cardElementRef}></div>
              </div>
              <ElButton
                type="primary"
                size="default"
                loading={state.loading}
                disabled={!state.stripe || state.loading}
                icon={null}
                onClick={handleSubmit}
              >
                {state.loading ? 'Processing...' : `Pay $`}
              </ElButton>
              {state.error && <div class="error-message">{state.error}</div>}
            </div>
          ) : (
            <p>Loading payment options...</p>
          )}
        </div>
      )
    }
  },
})
