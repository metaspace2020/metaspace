import Mutation from './Mutation'
import Query from './Query'
import Analyzer from './Analyzer'
import Dataset from './Dataset'
import DatasetUser from './DatasetUser'
import Subscription from './Subscription'
import { IResolvers } from 'graphql-tools'
import { Context } from '../../../context'

export const Resolvers = {
  Mutation,
  Query,
  Subscription,
  Analyzer,
  Dataset,
  DatasetUser,
} as IResolvers<any, Context>
