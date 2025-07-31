import { defineComponent, defineAsyncComponent, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElButton, ElCard, ElDivider, ElTag, ElNotification } from '../../lib/element-plus'
import { currentUserRoleQuery } from '../../api/user'
import { getSubscriptionWithPlanQuery, Subscription } from '../../api/subscription'
import { useQuery } from '@vue/apollo-composable'
import { formatPrice } from '../../lib/pricing'

import './SuccessPage.scss'

const SuccessCheckIcon = defineAsyncComponent(() => import('../../assets/success-check.svg'))

interface SubscriptionWithPlan extends Subscription {
  plan?: {
    id: string
    name: string
    description: string
    tier: string
  }
}

export default defineComponent({
  name: 'SuccessPage',
  setup() {
    const router = useRouter()
    const route = useRoute()

    const { result: currentUserResult } = useQuery<any>(currentUserRoleQuery, null, {
      fetchPolicy: 'network-only',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const subscriptionId = computed(() => route.query.subscriptionId as string)
    const fromPayment = computed(
      () => route.query.from === 'payment' || !!route.query.session_id || !!subscriptionId.value
    )

    const { result: subscriptionResult, loading: subscriptionLoading } = useQuery<{
      subscription: SubscriptionWithPlan
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

    const goToUpload = () => {
      router.push('/upload')
    }

    const goToDashboard = () => {
      router.push('/')
    }

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

    const downloadInvoice = () => {
      if (latestTransaction.value?.metadata?.stripeInvoiceUrl) {
        const link = document.createElement('a')
        link.href = latestTransaction.value.metadata.stripeInvoiceUrl
        link.download = `invoice-${subscription.value?.id}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
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
                Thank you for joining the community! You can immediately start exploring your benefits. You will also
                receive an email confirmation with details.
              </p>
              <div class="actions">
                <ElButton type="primary" class="api-docs-button" onClick={goToUpload}>
                  Upload your data
                </ElButton>
              </div>
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
                Thank you for joining the community! Your subscription is now active and you can immediately start
                exploring your benefits.
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
                <ElCard class="transaction-card">
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
                        {formatPrice(latestTransaction.value.finalAmountCents / 100)} {latestTransaction.value.currency}
                      </span>
                    </div>

                    {latestTransaction.value.couponApplied && (
                      <div class="detail-item">
                        <label>Discount Applied:</label>
                        <span class="value">
                          {latestTransaction.value.discountAmountCents
                            ? `${formatPrice(latestTransaction.value.discountAmountCents / 100)} ${
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

                  <ElDivider />

                  <div class="invoice-actions">
                    <h3>Invoice</h3>
                    <div class="action-buttons">
                      <ElButton type="primary" onClick={printInvoice}>
                        Print Invoice
                      </ElButton>
                      <ElButton onClick={downloadInvoice}>Download Invoice</ElButton>
                    </div>
                  </div>
                </ElCard>
              )}
            </div>

            <div class="actions">
              <ElButton type="primary" class="primary-button" onClick={goToUpload}>
                Upload your data
              </ElButton>
              <ElButton class="secondary-button" onClick={goToDashboard}>
                Go to Home page
              </ElButton>
            </div>
          </div>
        </div>
      )
    }
  },
})
