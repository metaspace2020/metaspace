import Query, { makeApiRequest } from './Query'
import Mutation from './Mutation'
import { IResolvers } from 'graphql-tools'
import { Context } from '../../../context'

export const Resolvers = {
  Query,
  Mutation,
  Order: {
    // Resolver for the payments field in the Order type
    async payments(parent: any, _: any, ctx: Context): Promise<any[]> {
      try {
        if (!parent.id) return []

        // Use the simple orderId parameter to get payments for this order
        const queryString = `?orderId=${parent.id}`
        const response = await makeApiRequest(ctx, `/api/payments${queryString}`)
        return response.data || []
      } catch (error) {
        console.error(`Error fetching payments for order ID ${parent.id}:`, error)
        return []
      }
    },
  },
} as IResolvers<any, Context>
