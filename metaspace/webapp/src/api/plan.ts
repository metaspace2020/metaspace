import gql from 'graphql-tag'

export interface PricingOption {
  id: string
  periodMonths: number
  priceCents: number
  displayName: string
  isActive: boolean
  displayOrder: number
}

export interface Plan {
  id: string
  tier: string
  name: string
  description: string
  isActive: boolean
  isDefault: boolean
  displayOrder: number
  pricingOptions: PricingOption[]
  planRules: PlanRule[]
}

export interface AllPlansData {
  allPlans: Plan[]
}

export interface PlanData {
  plan: Plan
}

export interface PlanRule {
  id: number
  planId: string
  plan: Plan
  actionType: string
  period: number
  periodType: string
  limit: number
  type: string
  visibility: string
  source: string
  createdAt: string
}

export interface AllPlanRulesData {
  allPlanRules: PlanRule[]
}

export interface PlanRuleData {
  planRule: PlanRule
}

export interface RemainingApiUsage {
  remaining: number
  limit: number
  periodType: string
  period: number
}

export interface ApiUsage {
  id: number
  userId: string
  datasetId: string
  projectId: string
  groupId: string
  actionType: string
  type: string
  source: string
  canEdit: boolean
  actionDt: string
  user: {
    id: string
    name: string
    email: string
  }
}

export interface AllApiUsagesData {
  allApiUsages: ApiUsage[]
}

export enum PlanOrderBy {
  ORDER_BY_DATE = 'ORDER_BY_DATE',
  ORDER_BY_NAME = 'ORDER_BY_NAME',
  ORDER_BY_ACTIVE = 'ORDER_BY_ACTIVE',
  ORDER_BY_DEFAULT = 'ORDER_BY_DEFAULT',
  ORDER_BY_MONTHLY_PRICE = 'ORDER_BY_MONTHLY_PRICE',
  ORDER_BY_YEARLY_PRICE = 'ORDER_BY_YEARLY_PRICE',
  ORDER_BY_DISPLAY_ORDER = 'ORDER_BY_DISPLAY_ORDER',
}

export enum PlanRuleOrderBy {
  ORDER_BY_DATE = 'ORDER_BY_DATE',
  ORDER_BY_ACTION_TYPE = 'ORDER_BY_ACTION_TYPE',
  ORDER_BY_TYPE = 'ORDER_BY_TYPE',
  ORDER_BY_VISIBILITY = 'ORDER_BY_VISIBILITY',
  ORDER_BY_SOURCE = 'ORDER_BY_SOURCE',
  ORDER_BY_PLAN = 'ORDER_BY_PLAN',
}

export enum ApiUsageOrderBy {
  ORDER_BY_DATE = 'ORDER_BY_DATE',
  ORDER_BY_USER = 'ORDER_BY_USER',
  ORDER_BY_ACTION_TYPE = 'ORDER_BY_ACTION_TYPE',
  ORDER_BY_TYPE = 'ORDER_BY_TYPE',
  ORDER_BY_SOURCE = 'ORDER_BY_SOURCE',
}

export enum SortingOrder {
  ASCENDING = 'ASCENDING',
  DESCENDING = 'DESCENDING',
}

export interface PlanFilter {
  tier?: string
  name?: string
  isActive?: boolean
  isDefault?: boolean
  createdAt?: string
  displayOrder?: number
}

export interface PlanRuleFilter {
  actionType?: string
  type?: string
  visibility?: string
  source?: string
  createdAt?: string
}

export interface ApiUsageFilter {
  userId?: string
  datasetId?: string
  projectId?: string
  groupId?: string
  actionType?: string
  type?: string
  source?: string
  canEdit?: boolean
  startDate?: string
  endDate?: string
}

export const planFragment = gql`
  fragment Plan on Plan {
    id
    tier
    name
    description
    isActive
    isDefault
    displayOrder
    pricingOptions {
      id
      periodMonths
      priceCents
      displayName
      isActive
      displayOrder
    }
  }
`

export const planRuleFragment = gql`
  fragment PlanRule on PlanRule {
    id
    planId
    actionType
    period
    periodType
    limit
    type
    visibility
    source
    createdAt
  }
`

export const apiUsageFragment = gql`
  fragment ApiUsage on ApiUsage {
    id
    userId
    datasetId
    projectId
    groupId
    actionType
    type
    source
    canEdit
    actionDt
  }
`

export const getPlansQuery = gql`
  query {
    allPlans {
      ...Plan
    }
  }
  ${planFragment}
`
export const getPlanQuery = gql`
  query ($planId: String!) {
    plan(id: $planId) {
      ...Plan
    }
  }
  ${planFragment}
`

export const getFilteredPlansQuery = gql`
  query (
    $orderBy: PlanOrderBy
    $sortingOrder: SortingOrder
    $filter: PlanFilter
    $simpleQuery: String
    $offset: Int
    $limit: Int
  ) {
    allPlans(
      orderBy: $orderBy
      sortingOrder: $sortingOrder
      filter: $filter
      simpleQuery: $simpleQuery
      offset: $offset
      limit: $limit
    ) {
      ...Plan
    }
    plansCount(filter: $filter)
  }
  ${planFragment}
`

export const getPlanRuleQuery = gql`
  query ($planRuleId: Int!) {
    planRule(id: $planRuleId) {
      ...PlanRule
    }
  }
  ${planRuleFragment}
`

export const getPlanRulesQuery = gql`
  query (
    $planId: String
    $filter: PlanRuleFilter
    $orderBy: PlanRuleOrderBy
    $sortingOrder: SortingOrder
    $offset: Int
    $limit: Int
  ) {
    allPlanRules(
      planId: $planId
      filter: $filter
      orderBy: $orderBy
      sortingOrder: $sortingOrder
      offset: $offset
      limit: $limit
    ) {
      ...PlanRule
    }
    planRulesCount(planId: $planId, filter: $filter)
  }
  ${planRuleFragment}
`

export const getApiUsagesQuery = gql`
  query ($orderBy: ApiUsageOrderBy, $sortingOrder: SortingOrder, $filter: ApiUsageFilter, $offset: Int, $limit: Int) {
    allApiUsages(orderBy: $orderBy, sortingOrder: $sortingOrder, filter: $filter, offset: $offset, limit: $limit) {
      ...ApiUsage
      user {
        id
        name
        email
      }
    }
    apiUsagesCount(filter: $filter)
  }
  ${apiUsageFragment}
`
export const getRemainingApiUsagesQuery = gql`
  query ($groupId: String!) {
    remainingApiUsages(groupId: $groupId) {
      limit
      periodType
      period
      remaining
    }
  }
`
