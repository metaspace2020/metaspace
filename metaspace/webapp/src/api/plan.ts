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
