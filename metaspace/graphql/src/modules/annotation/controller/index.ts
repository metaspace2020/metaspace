import Query from './Query'
import Annotation from './Annotation'
import { IResolvers } from 'graphql-tools'
import { Context } from '../../../context'

export const Resolvers = {
  Query,
  Annotation,
} as IResolvers<any, Context>
