import gql from 'graphql-tag'
import { Plan } from './plan'

// Enums
export enum BillingInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PENDING = 'pending',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum TransactionType {
  SUBSCRIPTION = 'subscription',
  ONE_TIME = 'one_time',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
  UPGRADE = 'upgrade',
  DOWNGRADE = 'downgrade',
  RENEWAL = 'renewal',
  CANCELLATION = 'cancellation',
}

export enum SubscriptionOrderBy {
  ORDER_BY_DATE = 'ORDER_BY_DATE',
  ORDER_BY_USER = 'ORDER_BY_USER',
  ORDER_BY_PLAN = 'ORDER_BY_PLAN',
  ORDER_BY_STATUS = 'ORDER_BY_STATUS',
  ORDER_BY_BILLING_INTERVAL = 'ORDER_BY_BILLING_INTERVAL',
}

export enum TransactionOrderBy {
  ORDER_BY_DATE = 'ORDER_BY_DATE',
  ORDER_BY_USER = 'ORDER_BY_USER',
  ORDER_BY_AMOUNT = 'ORDER_BY_AMOUNT',
  ORDER_BY_SUBSCRIPTION = 'ORDER_BY_SUBSCRIPTION',
  ORDER_BY_STATUS = 'ORDER_BY_STATUS',
  ORDER_BY_TYPE = 'ORDER_BY_TYPE',
}

// Interfaces
export interface PaymentMethod {
  id: string
  type: string
  last4: string
}

export interface Subscription {
  id: string
  userId: string
  planId: string
  billingInterval?: BillingInterval
  stripeSubscriptionId?: string
  stripeCustomerId?: string
  startedAt: string
  expiresAt?: string
  cancelledAt?: string
  isActive: boolean
  autoRenew: boolean
  transactions?: Transaction[]
  createdAt: string
  updatedAt: string
  plan: Plan
  paymentMethod?: PaymentMethod
}

export interface Transaction {
  id: string
  userId: string
  subscriptionId: string

  // Stripe transaction information
  stripePaymentIntentId?: string
  stripeInvoiceId?: string
  stripeSubscriptionId?: string

  // Transaction details (amounts in cents)
  originalAmountCents: number
  finalAmountCents: number
  currency: string

  // Coupon information
  couponApplied: boolean
  stripeCouponId?: string
  couponName?: string
  discountAmountCents?: number
  discountPercentage?: number

  // Transaction status and metadata
  status: TransactionStatus
  type: TransactionType
  transactionDate: string
  description?: string
  metadata?: any

  // Billing period covered by this transaction
  billingPeriodStart?: string
  billingPeriodEnd?: string

  createdAt: string
  updatedAt: string
}

export interface AllSubscriptionsData {
  allSubscriptions: Subscription[]
  subscriptionsCount: number
}

export interface SubscriptionData {
  subscription: Subscription
}

export interface UserSubscriptionsData {
  userSubscriptions: Subscription[]
}

export interface ActiveUserSubscriptionData {
  activeUserSubscription: Subscription
}

export interface AllTransactionsData {
  allTransactions: Transaction[]
  transactionsCount: number
}

export interface TransactionData {
  transaction: Transaction
}

export interface UserTransactionsData {
  userTransactions: Transaction[]
}

export interface SubscriptionTransactionsData {
  subscriptionTransactions: Transaction[]
}

// Filter interfaces
export interface SubscriptionFilter {
  userId?: string
  planId?: string
  isActive?: boolean
  billingInterval?: BillingInterval
  stripeSubscriptionId?: string
  stripeCustomerId?: string
  startDate?: string
  endDate?: string
}

export interface TransactionFilter {
  userId?: string
  subscriptionId?: string
  stripePaymentIntentId?: string
  stripeInvoiceId?: string
  stripeSubscriptionId?: string
  currency?: string
  status?: TransactionStatus
  type?: TransactionType
  couponApplied?: boolean
  startDate?: string
  endDate?: string
}

// Input interfaces
export interface CreateSubscriptionInput {
  userId: string
  planId: string
  pricingId: string
  groupId?: string
  groupName?: string
  email: string
  name: string
  billingInterval?: BillingInterval
  paymentMethodId?: string
  couponCode?: string
  autoRenew?: boolean
}

export interface UpdateSubscriptionInput {
  autoRenew?: boolean
  metadata?: any
}

export interface CancelSubscriptionInput {
  reason?: string
}

export interface ValidateCouponInput {
  couponCode: string
  planId: string
  billingInterval: BillingInterval
}

export interface CouponValidationResult {
  isValid: boolean
  couponCode: string
  message: string
  originalPriceCents?: number
  discountedPriceCents?: number
  discountAmountCents?: number
  discountPercentage?: number
  couponName?: string
}

export interface ValidateCouponData {
  validateCoupon: CouponValidationResult
}

// GraphQL Fragments
export const transactionFragment = gql`
  fragment Transaction on Transaction {
    id
    userId
    subscriptionId
    stripePaymentIntentId
    stripeInvoiceId
    stripeSubscriptionId
    originalAmountCents
    finalAmountCents
    currency
    couponApplied
    stripeCouponId
    couponName
    discountAmountCents
    discountPercentage
    status
    type
    transactionDate
    description
    metadata
    billingPeriodStart
    billingPeriodEnd
    createdAt
    updatedAt
  }
`

export const subscriptionFragment = gql`
  fragment Subscription on Subscription {
    id
    userId
    planId
    billingInterval
    stripeSubscriptionId
    stripeCustomerId
    startedAt
    expiresAt
    cancelledAt
    isActive
    autoRenew
    createdAt
    updatedAt
  }
`

export const subscriptionWithTransactionsFragment = gql`
  fragment SubscriptionWithTransactions on Subscription {
    ...Subscription
    transactions {
      ...Transaction
    }
  }
  ${subscriptionFragment}
  ${transactionFragment}
`

// Subscription Queries
export const getSubscriptionQuery = gql`
  query ($id: ID!) {
    subscription(id: $id) {
      ...Subscription
    }
  }
  ${subscriptionFragment}
`

export const getSubscriptionWithTransactionsQuery = gql`
  query ($id: ID!) {
    subscription(id: $id) {
      ...SubscriptionWithTransactions
    }
  }
  ${subscriptionWithTransactionsFragment}
`

export const getSubscriptionWithPlanQuery = gql`
  query ($id: ID!) {
    subscription(id: $id) {
      ...SubscriptionWithTransactions
      plan {
        id
        name
        description
        tier
      }
    }
  }
  ${subscriptionWithTransactionsFragment}
`

export const getAllSubscriptionsQuery = gql`
  query (
    $filter: SubscriptionFilter
    $orderBy: SubscriptionOrderBy
    $sortingOrder: SortingOrder
    $offset: Int
    $limit: Int
  ) {
    allSubscriptions(filter: $filter, orderBy: $orderBy, sortingOrder: $sortingOrder, offset: $offset, limit: $limit) {
      ...Subscription
    }
    subscriptionsCount(filter: $filter)
  }
  ${subscriptionFragment}
`

export const getUserSubscriptionsQuery = gql`
  query {
    userSubscriptions {
      ...SubscriptionWithTransactions
    }
  }
  ${subscriptionWithTransactionsFragment}
`

export const getActiveUserSubscriptionQuery = gql`
  query {
    activeUserSubscription {
      ...SubscriptionWithTransactions
    }
  }
  ${subscriptionWithTransactionsFragment}
`

// Transaction Queries
export const getTransactionQuery = gql`
  query ($id: ID!) {
    transaction(id: $id) {
      ...Transaction
    }
  }
  ${transactionFragment}
`

export const getAllTransactionsQuery = gql`
  query (
    $filter: TransactionFilter
    $orderBy: TransactionOrderBy
    $sortingOrder: SortingOrder
    $offset: Int
    $limit: Int
  ) {
    allTransactions(filter: $filter, orderBy: $orderBy, sortingOrder: $sortingOrder, offset: $offset, limit: $limit) {
      ...Transaction
    }
    transactionsCount(filter: $filter)
  }
  ${transactionFragment}
`

export const getUserTransactionsQuery = gql`
  query ($userId: ID!) {
    userTransactions(userId: $userId) {
      ...Transaction
    }
  }
  ${transactionFragment}
`

export const getSubscriptionTransactionsQuery = gql`
  query ($subscriptionId: ID!) {
    subscriptionTransactions(subscriptionId: $subscriptionId) {
      ...Transaction
    }
  }
  ${transactionFragment}
`

export const getTransactionsByStatusQuery = gql`
  query ($status: TransactionStatus!) {
    transactionsByStatus(status: $status) {
      ...Transaction
    }
  }
  ${transactionFragment}
`

export const getTransactionsByTypeQuery = gql`
  query ($type: TransactionType!) {
    transactionsByType(type: $type) {
      ...Transaction
    }
  }
  ${transactionFragment}
`

export const getPendingTransactionsQuery = gql`
  query {
    pendingTransactions {
      ...Transaction
    }
  }
  ${transactionFragment}
`

export const getTransactionsByDateRangeQuery = gql`
  query ($startDate: String!, $endDate: String!) {
    transactionsByDateRange(startDate: $startDate, endDate: $endDate) {
      ...Transaction
    }
  }
  ${transactionFragment}
`

// Mutations
export const createSubscriptionMutation = gql`
  mutation ($input: CreateSubscriptionInput!) {
    createSubscription(input: $input) {
      ...Subscription
    }
  }
  ${subscriptionFragment}
`

export const updateSubscriptionMutation = gql`
  mutation ($id: ID!, $input: UpdateSubscriptionInput!) {
    updateSubscription(id: $id, input: $input) {
      ...Subscription
    }
  }
  ${subscriptionFragment}
`

export const cancelSubscriptionMutation = gql`
  mutation ($id: ID!, $input: CancelSubscriptionInput) {
    cancelSubscription(id: $id, input: $input) {
      ...Subscription
    }
  }
  ${subscriptionFragment}
`

export const processStripeWebhookMutation = gql`
  mutation ($payload: String!) {
    processStripeWebhook(payload: $payload)
  }
`

// Coupon validation query
export const validateCouponQuery = gql`
  query ($input: ValidateCouponInput!) {
    validateCoupon(input: $input) {
      isValid
      couponCode
      message
      originalPriceCents
      discountedPriceCents
      discountAmountCents
      discountPercentage
      couponName
    }
  }
`
export const getActiveGroupSubscriptionQuery = gql`
  query ($groupId: ID!) {
    activeGroupSubscription(groupId: $groupId) {
      ...Subscription
      paymentMethod {
        id
        type
        last4
      }
      plan {
        id
        name
        description
        tier
        planRules {
          id
          actionType
          period
          periodType
          limit
        }
      }
      transactions {
        metadata
        originalAmountCents
        finalAmountCents
        currency
        couponApplied
        stripeCouponId
        couponName
        transactionDate
        status
      }
    }
  }
  ${subscriptionFragment}
`

export const getActiveGroupSubscriptionSimpleQuery = gql`
  query ($groupId: ID!) {
    activeGroupSubscription(groupId: $groupId) {
      id
      userId
      planId
      billingInterval
      startedAt
      expiresAt
    }
  }
`
