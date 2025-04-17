import gql from 'graphql-tag'

// Location interfaces
export interface Country {
  id: string
  name: string
  code: string
  createdAt: string
  updatedAt: string
}

export interface State {
  id: string
  name: string
  code: string
  countryId: string
  createdAt: string
  updatedAt: string
}

export interface AllCountriesData {
  allCountries: Country[]
  countriesCount: number
}

export interface CountryData {
  country: Country
}

export interface AllStatesData {
  allStates: State[]
  statesCount: number
}

export interface StateData {
  state: State
}

export enum LocationOrderBy {
  NAME = 'NAME',
  CODE = 'CODE',
  CREATED_AT = 'CREATED_AT',
  UPDATED_AT = 'UPDATED_AT',
}

export enum SortingOrder {
  ASCENDING = 'ASCENDING',
  DESCENDING = 'DESCENDING',
}

export interface CountryFilter {
  name?: string
  code?: string
}

export interface StateFilter {
  name?: string
  code?: string
  countryId?: string
}

export interface OrderItem {
  name: string
  productId: string
  quantity: number
  unitPrice: number
}

export interface Payment {
  id: number
  orderId: number
  userId: string
  amount: number
  currency: string
  paymentMethod: PaymentMethod
  status: PaymentStatus
  type: string
  stripeChargeId: string
  externalReference?: string
  metadata?: any
  createdAt: string
  updatedAt: string
}

export interface Order {
  id: number
  userId: string
  planId?: number
  orderId: string
  status: OrderStatus
  type: string
  totalAmount: number
  currency: string
  items: OrderItem[]
  metadata?: any
  billingAddress?: string
  billingCity?: string
  billingPostalCode?: string
  billingCountryId?: number
  billingStateId?: number
  createdAt: string
  updatedAt: string
  payments?: Payment[]
}

export interface AllOrdersData {
  allOrders: Order[]
  ordersCount: number
}

export interface OrderData {
  order: Order
}

export interface AllPaymentsData {
  allPayments: Payment[]
  paymentsCount: number
}

export interface PaymentData {
  payment: Payment
}

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum PaymentStatus {
  SUCCEEDED = 'succeeded',
  AUTHORIZED = 'authorized',
  FAILED = 'failed',
  PENDING = 'pending',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  PAYPAL = 'paypal',
  BANK_TRANSFER = 'bank_transfer',
  OTHER = 'other',
}

export enum OrderOrderBy {
  ORDER_BY_DATE = 'ORDER_BY_DATE',
  ORDER_BY_STATUS = 'ORDER_BY_STATUS',
  ORDER_BY_USER = 'ORDER_BY_USER',
  ORDER_BY_AMOUNT = 'ORDER_BY_AMOUNT',
}

export enum PaymentOrderBy {
  ORDER_BY_DATE = 'ORDER_BY_DATE',
  ORDER_BY_STATUS = 'ORDER_BY_STATUS',
  ORDER_BY_USER = 'ORDER_BY_USER',
  ORDER_BY_AMOUNT = 'ORDER_BY_AMOUNT',
}

export interface OrderFilter {
  userId?: string
  planId?: number
  orderId?: string
  status?: OrderStatus
  type?: string
  startDate?: string
  endDate?: string
}

export interface PaymentFilter {
  userId?: string
  orderId?: number
  status?: PaymentStatus
  stripeChargeId?: string
  paymentMethod?: PaymentMethod
  startDate?: string
  endDate?: string
}

export interface OrderItemInput {
  name: string
  productId: string
  quantity: number
  unitPrice: number
}

export interface CreateOrderInput {
  userId: string
  planId?: number
  status: OrderStatus
  type: string
  totalAmount: number
  currency: string
  items: OrderItemInput[]
  metadata?: any
  billingAddress?: string
  billingCity?: string
  billingPostalCode?: string
  billingCountryId?: number
  billingStateId?: number
}

export interface UpdateOrderInput {
  status?: OrderStatus
  metadata?: any
}

export interface CreatePaymentInput {
  orderId: number
  userId: string
  amount: number
  currency: string
  paymentMethod: PaymentMethod
  status: PaymentStatus
  type: string
  stripeChargeId: string
  externalReference?: string
  metadata?: any
}

export interface UpdatePaymentInput {
  status?: PaymentStatus
  metadata?: any
}

export interface RefundPaymentInput {
  amount?: number
  reason?: string
}

export const orderItemFragment = gql`
  fragment OrderItem on OrderItem {
    name
    productId
    quantity
    unitPrice
  }
`

export const paymentFragment = gql`
  fragment Payment on Payment {
    id
    orderId
    userId
    amount
    currency
    paymentMethod
    status
    type
    stripeChargeId
    externalReference
    metadata
    createdAt
    updatedAt
  }
`

export const orderFragment = gql`
  fragment Order on Order {
    id
    userId
    planId
    status
    type
    totalAmount
    currency
    items {
      ...OrderItem
    }
    metadata
    billingAddress
    billingCity
    billingPostalCode
    billingCountryId
    billingStateId
    createdAt
    updatedAt
  }
  ${orderItemFragment}
`

export const orderWithPaymentsFragment = gql`
  fragment OrderWithPayments on Order {
    ...Order
    payments {
      ...Payment
    }
  }
  ${orderFragment}
  ${paymentFragment}
`

// Queries
export const getOrderQuery = gql`
  query ($id: Int!) {
    order(id: $id) {
      ...Order
    }
  }
  ${orderFragment}
`

export const getOrderWithPaymentsQuery = gql`
  query ($id: Int!) {
    order(id: $id) {
      ...OrderWithPayments
    }
  }
  ${orderWithPaymentsFragment}
`

export const getAllOrdersQuery = gql`
  query (
    $filter: OrderFilter
    $includePayments: Boolean
    $orderBy: OrderOrderBy
    $sortingOrder: SortingOrder
    $page: Int
    $limit: Int
  ) {
    allOrders(
      filter: $filter
      includePayments: $includePayments
      orderBy: $orderBy
      sortingOrder: $sortingOrder
      page: $page
      limit: $limit
    ) {
      ...Order
      payments @include(if: $includePayments) {
        ...Payment
      }
    }
    ordersCount(filter: $filter)
  }
  ${orderFragment}
  ${paymentFragment}
`

export const getPaymentQuery = gql`
  query ($id: Int!) {
    payment(id: $id) {
      ...Payment
    }
  }
  ${paymentFragment}
`

export const getAllPaymentsQuery = gql`
  query ($filter: PaymentFilter, $orderBy: PaymentOrderBy, $sortingOrder: SortingOrder, $page: Int, $limit: Int) {
    allPayments(filter: $filter, orderBy: $orderBy, sortingOrder: $sortingOrder, page: $page, limit: $limit) {
      ...Payment
    }
    paymentsCount(filter: $filter)
  }
  ${paymentFragment}
`

// Mutations
export const createOrderMutation = gql`
  mutation ($input: CreateOrderInput!) {
    createOrder(input: $input) {
      ...Order
    }
  }
  ${orderFragment}
`

export const updateOrderMutation = gql`
  mutation ($id: Int!, $input: UpdateOrderInput!) {
    updateOrder(id: $id, input: $input) {
      ...Order
    }
  }
  ${orderFragment}
`

export const deleteOrderMutation = gql`
  mutation ($id: Int!) {
    deleteOrder(id: $id)
  }
`

export const createPaymentMutation = gql`
  mutation ($input: CreatePaymentInput!) {
    createPayment(input: $input) {
      ...Payment
    }
  }
  ${paymentFragment}
`

export const updatePaymentMutation = gql`
  mutation ($id: Int!, $input: UpdatePaymentInput!) {
    updatePayment(id: $id, input: $input) {
      ...Payment
    }
  }
  ${paymentFragment}
`

export const deletePaymentMutation = gql`
  mutation ($id: Int!) {
    deletePayment(id: $id)
  }
`

export const refundPaymentMutation = gql`
  mutation ($id: Int!, $input: RefundPaymentInput!) {
    refundPayment(id: $id, input: $input) {
      ...Payment
    }
  }
  ${paymentFragment}
`

// Location Fragments
export const countryFragment = gql`
  fragment Country on Country {
    id
    name
    code
    createdAt
    updatedAt
  }
`

export const stateFragment = gql`
  fragment State on State {
    id
    name
    code
    countryId
    createdAt
    updatedAt
  }
`

// Location Queries
export const getCountryQuery = gql`
  query ($id: String!) {
    country(id: $id) {
      ...Country
    }
  }
  ${countryFragment}
`

export const getAllCountriesQuery = gql`
  query ($filter: CountryFilter, $orderBy: LocationOrderBy, $sortingOrder: SortingOrder, $page: Int, $limit: Int) {
    allCountries(filter: $filter, orderBy: $orderBy, sortingOrder: $sortingOrder, page: $page, limit: $limit) {
      ...Country
    }
    countriesCount(filter: $filter)
  }
  ${countryFragment}
`

export const getStateQuery = gql`
  query ($id: String!) {
    state(id: $id) {
      ...State
    }
  }
  ${stateFragment}
`

export const getAllStatesQuery = gql`
  query ($filter: StateFilter, $orderBy: LocationOrderBy, $sortingOrder: SortingOrder, $page: Int, $limit: Int) {
    allStates(filter: $filter, orderBy: $orderBy, sortingOrder: $sortingOrder, page: $page, limit: $limit) {
      ...State
    }
    statesCount(filter: $filter)
  }
  ${stateFragment}
`
