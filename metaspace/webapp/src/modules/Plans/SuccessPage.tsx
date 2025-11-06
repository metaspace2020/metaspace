import { defineComponent, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElButton, ElCard, ElTag, ElNotification } from '../../lib/element-plus'
import { currentUserRoleQuery } from '../../api/user'
import { getSubscriptionWithPlanQuery } from '../../api/subscription'
import { useQuery } from '@vue/apollo-composable'
import { formatPrice } from '../../lib/pricing'
import SuccessCheckIcon from '../../assets/success-check.svg'
import './SuccessPage.scss'
import { useStore } from 'vuex'
import { trackSuccessPageView, trackPurchaseComplete } from '../../lib/gtag'

export default defineComponent({
  name: 'SuccessPage',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const store = useStore()

    const { result: currentUserResult } = useQuery<any>(currentUserRoleQuery, null, {
      fetchPolicy: 'network-only',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const subscriptionId = computed(() => route.query.subscriptionId as string)
    const groupId = computed(() => route.query.groupId as string)

    const fromPayment = computed(
      () => route.query.from === 'payment' || !!route.query.session_id || !!subscriptionId.value
    )

    const { result: subscriptionResult, loading: subscriptionLoading } = useQuery<{
      subscription: any
    }>(
      getSubscriptionWithPlanQuery,
      () => ({ id: subscriptionId.value }),
      () => ({
        enabled: !!subscriptionId.value,
        fetchPolicy: 'network-only',
      })
    )

    const subscription = computed(() => subscriptionResult.value?.subscription)
    const latestTransaction = computed(() => {
      if (!subscription.value?.transactions?.length) return null
      return subscription.value.transactions[0] // Assuming transactions are ordered by date desc
    })

    const goToDashboard = () => {
      router.push({
        name: 'group',
        params: { groupIdOrSlug: groupId.value },
        query: { tab: 'subscription' },
      })
    }

    // Track success page view on mount
    onMounted(() => {
      if (currentUser.value?.id) {
        // Track success page view
        trackSuccessPageView(currentUser.value?.id, fromPayment.value)

        // Track purchase completion if coming from payment
        if (fromPayment.value && subscription.value && latestTransaction.value) {
          trackPurchaseComplete({
            transactionId: latestTransaction?.value?.id,
            value: latestTransaction?.value?.amount || 0,
            planId: subscription?.value?.plan?.id || 'unknown',
            planName: subscription?.value?.plan?.name || 'unknown',
            subscriptionId: subscription?.value?.id,
          })
        }
      }
    })

    const printInvoice = () => {
      if (latestTransaction.value?.metadata?.stripeInvoiceUrl) {
        window.open(latestTransaction.value.metadata.stripeInvoiceUrl, '_blank')
      } else {
        ElNotification({
          title: 'Invoice Not Available',
          message: 'Invoice URL is not available for this transaction.',
          type: 'warning',
        })
      }
    }

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    }

    const formatBillingInterval = (interval: string) => {
      return interval === 'monthly' ? 'Monthly' : 'Yearly'
    }

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'completed':
          return 'success'
        case 'pending':
          return 'warning'
        case 'failed':
          return 'danger'
        default:
          return 'info'
      }
    }

    // Set pro theme on mount
    onMounted(() => {
      store.commit('setThemeVariant', 'pro')
    })

    // Reset to default theme on unmount
    // onBeforeUnmount(() => {
    //   store.commit('setThemeVariant', 'default')
    // })

    onMounted(() => {
      if (!currentUser.value || !fromPayment.value) {
        // router.push('/404')
      }
    })

    return () => {
      if (!currentUser.value) return null

      // Show loading state
      if (subscriptionLoading.value) {
        return (
          <div class="success-page">
            <div class="success-container">
              <div class="loading">Loading subscription details...</div>
            </div>
          </div>
        )
      }

      // Show basic success page if no subscription details
      if (!subscription.value) {
        return (
          <div class="success-page">
            <div class="success-container">
              <div class="success-icon">
                <SuccessCheckIcon />
              </div>
              <h1 class="success-title">Subscription successful!</h1>
              <p class="success-message">
                Thank you for subscribing to METASPACE Pro. Your subscription is now active. You can see the status in
                the Subscription tab of your Group.
              </p>
            </div>
          </div>
        )
      }

      // Show detailed success page with subscription information
      return (
        <div class="success-page">
          <div class="success-container">
            <div class="success-header">
              <div class="success-icon">
                <SuccessCheckIcon />
              </div>
              <h1 class="success-title">Subscription successful!</h1>
              <p class="success-message">
                Thank you for subscribing to METASPACE Pro. Your subscription is now active. You can see the status in
                the Subscription tab of your Group.
              </p>
            </div>

            <div class="subscription-details">
              <ElCard class="subscription-card">
                <div class="card-header">
                  <h2>Subscription Details</h2>
                  <ElTag type="success" size="large">
                    Active
                  </ElTag>
                </div>

                <div class="details-grid">
                  <div class="detail-item">
                    <label>Subscription ID:</label>
                    <span class="value">{subscription.value.id}</span>
                  </div>

                  <div class="detail-item">
                    <label>Plan:</label>
                    <span class="value">{subscription.value.plan?.name || 'Unknown Plan'}</span>
                  </div>

                  <div class="detail-item">
                    <label>Billing Interval:</label>
                    <span class="value">{formatBillingInterval(subscription.value.billingInterval || 'monthly')}</span>
                  </div>

                  <div class="detail-item">
                    <label>Started:</label>
                    <span class="value">{formatDate(subscription.value.startedAt)}</span>
                  </div>

                  {subscription.value.expiresAt && (
                    <div class="detail-item">
                      <label>Expires:</label>
                      <span class="value">{formatDate(subscription.value.expiresAt)}</span>
                    </div>
                  )}

                  <div class="detail-item">
                    <label>Auto Renew:</label>
                    <span class="value">
                      <ElTag type={subscription.value.autoRenew ? 'success' : 'warning'}>
                        {subscription.value.autoRenew ? 'Yes' : 'No'}
                      </ElTag>
                    </span>
                  </div>
                </div>

                {subscription.value.plan?.description && (
                  <div class="plan-description">
                    <h3>Plan Features</h3>
                    <div class="safe-html" innerHTML={subscription.value.plan.description} />
                  </div>
                )}
              </ElCard>

              {latestTransaction.value && (
                <ElCard class="transaction-card" bodyClass="relative h-full mb-5">
                  <div class="card-header">
                    <h2>Payment Details</h2>
                    <ElTag type={getStatusColor(latestTransaction.value.status)} size="large">
                      {latestTransaction.value.status.charAt(0).toUpperCase() + latestTransaction.value.status.slice(1)}
                    </ElTag>
                  </div>

                  <div class="details-grid">
                    <div class="detail-item">
                      <label>Transaction ID:</label>
                      <span class="value">{latestTransaction.value.id}</span>
                    </div>

                    <div class="detail-item">
                      <label>Amount:</label>
                      <span class="value">
                        {formatPrice(latestTransaction.value.finalAmountCents)} {latestTransaction.value.currency}
                      </span>
                    </div>

                    {latestTransaction.value.couponApplied && (
                      <div class="detail-item">
                        <label>Discount Applied:</label>
                        <span class="value">
                          {latestTransaction.value.discountAmountCents
                            ? `${formatPrice(latestTransaction.value.discountAmountCents)} ${
                                latestTransaction.value.currency
                              }`
                            : `${latestTransaction.value.discountPercentage}%`}
                        </span>
                      </div>
                    )}

                    <div class="detail-item">
                      <label>Payment Date:</label>
                      <span class="value">{formatDate(latestTransaction.value.transactionDate)}</span>
                    </div>

                    {latestTransaction.value.description && (
                      <div class="detail-item">
                        <label>Description:</label>
                        <span class="value">{latestTransaction.value.description}</span>
                      </div>
                    )}
                  </div>

                  <div class="invoice-actions absolute bottom-10 left-0 right-0">
                    <div class="action-buttons">
                      <ElButton type="primary" onClick={printInvoice}>
                        View Invoice
                      </ElButton>
                    </div>
                  </div>
                </ElCard>
              )}
            </div>

            <div class="actions">
              <ElButton class="secondary-button" onClick={goToDashboard}>
                Go to home page
              </ElButton>
            </div>
          </div>
        </div>
      )
    }
  },
})
