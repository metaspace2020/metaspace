import Query from './Query'
import Mutation from './Mutation'
import News from './News'
import { IResolvers } from 'graphql-tools'
import { Context } from '../../../context'

export const Resolvers = {
  Query,
  Mutation,
  News,
} as IResolvers<any, Context>
