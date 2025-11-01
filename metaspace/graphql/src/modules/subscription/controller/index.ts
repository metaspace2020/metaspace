import Query, { makeApiRequest } from './Query'
import Mutation from './Mutation'
import { IResolvers } from 'graphql-tools'
import { Context } from '../../../context'

export const Resolvers = {
  Query,
  Mutation,
} as IResolvers<any, Context>

export { makeApiRequest }
