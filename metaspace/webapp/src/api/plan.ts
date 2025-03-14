import gql from 'graphql-tag'

export interface Plan {
  id: number
  name: string
  price: number
  isActive: boolean
  description: string
  order: number
}

export interface AllPlansData {
  allPlans: Plan[]
}

export interface PlanData {
  plan: Plan
}

export interface PlanRule {
  id: number
  planId: number
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
}

export interface AllApiUsagesData {
  allApiUsages: ApiUsage[]
}

export enum PlanOrderBy {
  ORDER_BY_DATE = 'ORDER_BY_DATE',
  ORDER_BY_NAME = 'ORDER_BY_NAME',
  ORDER_BY_ACTIVE = 'ORDER_BY_ACTIVE',
  ORDER_BY_DEFAULT = 'ORDER_BY_DEFAULT',
  ORDER_BY_PRICE = 'ORDER_BY_PRICE',
  ORDER_BY_ORDER = 'ORDER_BY_ORDER',
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
  name?: string
  isActive?: boolean
  isDefault?: boolean
  createdAt?: string
  price?: number
  order?: number
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
    name
    price
    isActive
    description
    order
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
  query ($planId: Int!) {
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
    $planId: Int
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
    }
    apiUsagesCount(filter: $filter)
  }
  ${apiUsageFragment}
`
