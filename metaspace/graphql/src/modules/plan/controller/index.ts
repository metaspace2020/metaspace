import Query from './Query'
import Mutation from './Mutation'
import PlanRule from './PlanRule'
import { IResolvers } from 'graphql-tools'
import { Context } from '../../../context'

export const Resolvers = {
  Query,
  Mutation,
  PlanRule,
} as IResolvers<any, Context>
