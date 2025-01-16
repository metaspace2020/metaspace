import gql from 'graphql-tag'

export interface Plan {
  __typename: 'Plan'
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

export const getPlansQuery = gql`
  query AllPlans {
    allPlans {
      id
      name
      price
      isActive
      description
      order
    }
  }
`
