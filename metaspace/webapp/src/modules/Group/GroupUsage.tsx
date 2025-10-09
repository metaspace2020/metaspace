import { computed, defineComponent, inject, ref, watch } from 'vue'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { useRouter } from 'vue-router'
import { cancelSubscriptionMutation, getActiveGroupSubscriptionQuery } from '../../api/subscription'
import { ApiUsage, getApiUsagesQuery } from '../../api/plan'
import GroupQuota from './GroupQuota'
import { format } from 'date-fns'
import { Subscription, updateSubscriptionMutation } from '../../api/subscription'
import { PlanRule } from '../../api/plan'
import RouterLink from '../../components/RouterLink'
import './GroupUsage.scss'
import { ElMessage, ElSwitch } from '../../lib/element-plus'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'

export default defineComponent({
  name: 'GroupsListPage',
  props: {
    groupId: {
      type: String,
      default: '',
    },
  },
  setup: function (props) {
    const apolloClient = inject(DefaultApolloClient)
    const router = useRouter()
    const {
      result: activeGroupSubscriptionResult,
      loading: subscriptionLoading,
      refetch: refetchActiveGroupSubscription,
    } = useQuery<any>(getActiveGroupSubscriptionQuery, { groupId: props.groupId }, { fetchPolicy: 'network-only' })
    const activeGroupSubscription = computed(() =>
      activeGroupSubscriptionResult.value != null ? activeGroupSubscriptionResult.value.activeGroupSubscription : null
    )
    const { result: currentUserResult } = useQuery<CurrentUserRoleResult | any>(currentUserRoleQuery)
    const currentUser = computed(() => (currentUserResult.value != null ? currentUserResult.value.currentUser : null))

    const isAutoRenew = ref<boolean>(false)
    const updatingAutoRenew = ref<boolean>(false)

    watch(
      () => activeGroupSubscription.value,
      (sub) => {
        if (sub) {
          isAutoRenew.value = !!sub.autoRenew
        }
      },
      { immediate: true }
    )

    const onToggleAutoRenew = async (val: boolean) => {
      const subscription = activeGroupSubscription.value as Subscription | null
      if (!subscription || !apolloClient) return
      try {
        updatingAutoRenew.value = true
        await apolloClient.mutate({
          mutation: updateSubscriptionMutation,
          variables: { id: subscription.id, input: { autoRenew: val } },
        })
        isAutoRenew.value = val
      } finally {
        updatingAutoRenew.value = false
      }
    }

    const { result: allApiUsagesResult, loading: apiUsagesLoading } = useQuery<any>(
      getApiUsagesQuery,
      {
        filter: { groupId: props.groupId, actionType: 'create,update,reprocess', visibility: 'private' },
        orderBy: 'ORDER_BY_DATE',
        sortingOrder: 'DESCENDING',
        limit: 50,
      },
      { fetchPolicy: 'network-only' }
    )
    const allApiUsages = computed(() => (allApiUsagesResult.value != null ? allApiUsagesResult.value.allApiUsages : []))

    const handleCancelSubscription = async () => {
      const subscription = activeGroupSubscription.value as Subscription | null
      if (!subscription || !apolloClient) return

      try {
        await apolloClient.mutate({
          mutation: cancelSubscriptionMutation,
          variables: { id: subscription.id },
        })
        if (currentUser.value?.role === 'admin') {
          ElMessage.success('Subscription cancelled successfully!')
        } else {
          ElMessage.success('Subscription request sent to admin for cancellation!')
        }
        await refetchActiveGroupSubscription()
      } catch (error: any) {
        ElMessage.error(error?.message)
      }
    }

    const formatDate = (dateString: string) => {
      try {
        return format(new Date(dateString), 'PPP')
      } catch {
        return dateString
      }
    }

    const getStatusColor = (subscription: Subscription) => {
      if (!subscription.isActive) return 'danger'
      if (subscription.cancelledAt) return 'warning'
      return 'success'
    }

    const getStatusText = (subscription: Subscription) => {
      if (!subscription.isActive) return 'Inactive'
      if (subscription.cancelledAt) return 'Cancelled'
      return 'Active'
    }

    const getTierColor = (tier: string) => {
      switch (tier.toLowerCase()) {
        case 'premium':
          return 'warning'
        case 'standard':
          return 'info'
        case 'basic':
          return 'info'
        default:
          return ''
      }
    }

    const getActionTypeText = (actionType: string) => {
      switch (actionType.toLowerCase()) {
        case 'create':
          return 'private submissions'
        case 'update':
          return 'updated metadata'
        case 'reprocess':
          return 'private resubmissions'
        default:
          return actionType
      }
    }

    return () => {
      const subscription = activeGroupSubscription.value as Subscription

      // Show loading state while subscription data is loading
      if (subscriptionLoading.value) {
        return (
          <div class="subscription-container">
            <el-card class="subscription-card">
              {{
                header: () => (
                  <div class="card-header">
                    <span>Group subscription</span>
                  </div>
                ),
                default: () => (
                  <div class="loading-container">
                    <el-skeleton animated>
                      <el-skeleton-item variant="h3" style={{ width: '40%' }} />
                      <el-skeleton-item variant="text" style={{ width: '100%' }} />
                      <el-skeleton-item variant="text" style={{ width: '80%' }} />
                      <el-skeleton-item variant="text" style={{ width: '60%' }} />
                    </el-skeleton>
                  </div>
                ),
              }}
            </el-card>
          </div>
        )
      }

      if (!subscription) {
        return (
          <div class="subscription-container">
            <el-card class="subscription-card">
              {{
                header: () => (
                  <div class="card-header">
                    <span>Group subscription</span>
                  </div>
                ),
                default: () => (
                  <div class="empty-actions">
                    <p class="w-full">This group doesn't have an active subscription. Choose a plan to get started.</p>
                    <el-button type="primary" size="large" onClick={() => router.push('/plans')}>
                      View plans
                    </el-button>
                  </div>
                ),
              }}
            </el-card>
          </div>
        )
      }

      return (
        <div class="subscription-container">
          <el-card class="subscription-card">
            {{
              header: () => (
                <div class="card-header">
                  <span>Group subscription</span>
                  <el-tag type={getStatusColor(subscription)} size="small">
                    {getStatusText(subscription)}
                  </el-tag>
                </div>
              ),
              default: () => (
                <div class="subscription-content">
                  {/* Plan Information */}
                  <div class="section">
                    <h3 class="section-title">Plan information</h3>
                    <el-row gutter={20}>
                      <el-col span={12}>
                        <div class="info-item">
                          <label>Plan name:</label>
                          <div class="value">
                            <el-tag type={getTierColor(subscription.plan.tier)}>{subscription.plan.name}</el-tag>
                          </div>
                        </div>
                      </el-col>
                    </el-row>
                    <div class="info-item">
                      <label>Description:</label>
                      <div class="value description">{subscription.plan.description}</div>
                    </div>
                  </div>

                  {/* Subscription Details */}
                  <div class="section">
                    <h3 class="section-title">Subscription details</h3>
                    <el-row gutter={20}>
                      <el-col span={12}>
                        <div class="info-item">
                          <label>Subscription ID:</label>
                          <div class="value code">{subscription.id}</div>
                        </div>
                      </el-col>
                      <el-col span={12}>
                        <div class="info-item">
                          <label>Billing interval:</label>
                          <div class="value">
                            <el-tag type="info" size="small">
                              {subscription.billingInterval}
                            </el-tag>
                          </div>
                        </div>
                      </el-col>
                    </el-row>
                    <el-row gutter={20}>
                      <el-col span={12}>
                        <div class="info-item">
                          <label>Started:</label>
                          <div class="value">{formatDate(subscription.startedAt)}</div>
                        </div>
                      </el-col>
                      <el-col span={12}>
                        <div class="info-item">
                          <label>Expires:</label>
                          <div class="value">{formatDate(subscription.expiresAt)}</div>
                        </div>
                      </el-col>
                    </el-row>
                    <el-row gutter={20}>
                      <el-col span={12}>
                        <div class="info-item">
                          <label>Auto-renew:</label>
                          <div class="value">
                            <ElSwitch
                              modelValue={isAutoRenew.value}
                              onUpdate:modelValue={(val: boolean) => onToggleAutoRenew(val)}
                              activeText="On"
                              inactiveText="Off"
                              loading={updatingAutoRenew.value}
                              disabled={updatingAutoRenew.value}
                            />
                          </div>
                        </div>
                      </el-col>
                      {subscription.cancelledAt && (
                        <el-col span={12}>
                          <div class="info-item">
                            <label>Cancelled:</label>
                            <div class="value">{formatDate(subscription.cancelledAt)}</div>
                          </div>
                        </el-col>
                      )}
                    </el-row>
                  </div>

                  <div class="section">
                    <h3 class="section-title">Payment history</h3>
                    {subscription.transactions && subscription.transactions.length > 0 ? (
                      <el-table data={subscription.transactions} style={{ width: '100%' }}>
                        <el-table-column prop="transactionDate" label="Date" width="150">
                          {{
                            default: ({ row }: { row: any }) => (
                              <span>{formatDate(row.transactionDate || row.createdAt)}</span>
                            ),
                          }}
                        </el-table-column>

                        <el-table-column prop="originalAmountCents" label="Amount paid" width="140">
                          {{
                            default: ({ row }: { row: any }) => (
                              <span
                                class={`original-amount ${
                                  row.couponApplied && row.originalAmountCents !== row.finalAmountCents
                                    ? 'discounted'
                                    : ''
                                }`}
                              >
                                {row.currency?.toUpperCase()} ${(row.finalAmountCents / 100).toFixed(2)}
                              </span>
                            ),
                          }}
                        </el-table-column>
                        <el-table-column prop="couponApplied" label="Discount" width="100">
                          {{
                            default: ({ row }: { row: any }) =>
                              row.couponApplied ? (
                                <el-tag type="success" size="small">
                                  {row.couponName || 'Applied'}
                                </el-tag>
                              ) : (
                                <span>-</span>
                              ),
                          }}
                        </el-table-column>
                        <el-table-column prop="status" label="Status" width="100">
                          {{
                            default: ({ row }: { row: any }) => (
                              <el-tag
                                type={
                                  row.status === 'completed'
                                    ? 'success'
                                    : row.status === 'failed'
                                    ? 'danger'
                                    : 'warning'
                                }
                                size="small"
                              >
                                {row.status || 'completed'}
                              </el-tag>
                            ),
                          }}
                        </el-table-column>
                        <el-table-column align="right">
                          {{
                            default: ({ row }: { row: any }) =>
                              row.metadata?.stripeInvoiceUrl ? (
                                <div class="flex items-center justify-end w-full">
                                  <el-button
                                    type="primary"
                                    size="small"
                                    link
                                    onClick={() => window.open(row.metadata.stripeInvoiceUrl, '_blank')}
                                  >
                                    View Invoice
                                  </el-button>
                                </div>
                              ) : (
                                <span>-</span>
                              ),
                          }}
                        </el-table-column>
                      </el-table>
                    ) : (
                      <div class="empty-container">
                        <p>No payment history available</p>
                      </div>
                    )}
                  </div>
                  {/* Plan Rules */}
                  <div class="section">
                    <h3 class="section-title">Plan rules</h3>
                    {subscription.plan.planRules && subscription.plan.planRules.length > 0 ? (
                      <el-table data={subscription.plan.planRules} style={{ width: '100%' }}>
                        <el-table-column prop="actionType" label="Action" width="150">
                          {{
                            default: ({ row }: { row: PlanRule }) => (
                              <el-tag type="info" size="small">
                                {getActionTypeText(row.actionType)}
                              </el-tag>
                            ),
                          }}
                        </el-table-column>
                        <el-table-column prop="limit" label="Limit" width="100">
                          {{
                            default: ({ row }: { row: PlanRule }) => <span class="limit-value">{row.limit}</span>,
                          }}
                        </el-table-column>
                        <el-table-column prop="period" label="Period" width="150">
                          {{
                            default: ({ row }: { row: PlanRule }) => (
                              <span>
                                {row.period} {row.periodType}
                                {row.period > 1 ? 's' : ''}
                              </span>
                            ),
                          }}
                        </el-table-column>
                        <el-table-column label="Description">
                          {{
                            default: ({ row }: { row: PlanRule }) => (
                              <span>
                                {row.limit} {getActionTypeText(row.actionType)} per {row.period} {row.periodType}
                                {row.period > 1 ? 's' : ''}
                              </span>
                            ),
                          }}
                        </el-table-column>
                      </el-table>
                    ) : (
                      <div class="empty-container">
                        <p>No plan rules defined</p>
                      </div>
                    )}
                  </div>

                  {/* Remaining Quota */}
                  <div class="section">
                    <h3 class="section-title">Remaining quota</h3>
                    <GroupQuota groupId={props.groupId} types={['create', 'update', 'reprocess']} />
                  </div>

                  {/* All API Usages */}
                  <div class="section">
                    <h3 class="section-title">API usage history</h3>
                    {apiUsagesLoading.value ? (
                      <div class="loading-container">
                        <el-skeleton animated>
                          <el-skeleton-item variant="h3" style={{ width: '30%' }} />
                          <el-skeleton-item variant="text" style={{ width: '100%' }} />
                          <el-skeleton-item variant="text" style={{ width: '90%' }} />
                          <el-skeleton-item variant="text" style={{ width: '95%' }} />
                          <el-skeleton-item variant="text" style={{ width: '85%' }} />
                        </el-skeleton>
                      </div>
                    ) : allApiUsages.value &&
                      allApiUsages.value.filter((usage: ApiUsage) => usage.source).length > 0 ? (
                      <el-table
                        data={allApiUsages.value.filter((usage: ApiUsage) => usage.source)}
                        style={{ width: '100%' }}
                      >
                        <el-table-column prop="actionType" label="Action" width="150">
                          {{
                            default: ({ row }: { row: ApiUsage }) => (
                              <el-tag type="info" size="small">
                                {getActionTypeText(row.actionType)}
                              </el-tag>
                            ),
                          }}
                        </el-table-column>
                        <el-table-column prop="type" label="Type" width="100">
                          {{
                            default: ({ row }: { row: ApiUsage }) => (
                              <el-tag type="info" size="small">
                                {row.type}
                              </el-tag>
                            ),
                          }}
                        </el-table-column>
                        <el-table-column prop="source" label="Source" width="80">
                          {{
                            default: ({ row }: { row: ApiUsage }) => (
                              <el-tag type="warning" size="small">
                                {row.source}
                              </el-tag>
                            ),
                          }}
                        </el-table-column>
                        <el-table-column prop="userId" label="User" width="140">
                          {{
                            default: ({ row }: { row: ApiUsage }) => <span class="user-email">{row.user?.name}</span>,
                          }}
                        </el-table-column>
                        <el-table-column prop="actionDt" label="Date" width="180">
                          {{
                            default: ({ row }: { row: ApiUsage }) => <span>{formatDate(row.actionDt)}</span>,
                          }}
                        </el-table-column>
                        <el-table-column prop="datasetId" label="Dataset">
                          {{
                            default: ({ row }: { row: ApiUsage }) => (
                              <RouterLink to={`/dataset/${row.datasetId}`} newTab>
                                {row.datasetId || '-'}
                              </RouterLink>
                            ),
                          }}
                        </el-table-column>
                      </el-table>
                    ) : (
                      <div class="empty-container">
                        <p>No API usage history with source available</p>
                      </div>
                    )}
                  </div>

                  {/* Payment Information */}
                  <div class="section">
                    <h3 class="section-title">Payment information</h3>
                    <el-row gutter={20}>
                      {subscription.paymentMethod ? (
                        <>
                          <el-col span={12}>
                            <div class="info-item">
                              <label>Payment method:</label>
                              <div class="value">
                                <el-tag type="info" size="small">
                                  {subscription.paymentMethod.type}
                                </el-tag>
                              </div>
                            </div>
                          </el-col>
                          <el-col span={12}>
                            <div class="info-item">
                              <label>Card ending:</label>
                              <div class="value">•••• {subscription.paymentMethod.last4}</div>
                            </div>
                          </el-col>
                        </>
                      ) : (
                        <el-col span={24}>
                          <div class="info-item">
                            <label>Payment method:</label>
                            <div class="value">Not available</div>
                          </div>
                        </el-col>
                      )}
                    </el-row>
                  </div>

                  {/* Cancel Subscription */}
                  <div class="section">
                    <h3 class="section-title">Cancel subscription</h3>
                    <el-button type="danger" size="large" onClick={handleCancelSubscription}>
                      Cancel subscription
                    </el-button>
                  </div>
                </div>
              ),
            }}
          </el-card>
        </div>
      )
    }
  },
})
