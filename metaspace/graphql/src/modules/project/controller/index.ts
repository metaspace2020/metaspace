import { IResolvers } from 'graphql-tools'
import { Context } from '../../../context'
import Mutation from './Mutation'
import UserProject from './UserProject'
import Project from './Project'
import Query from './Query'

export const Resolvers = {
  UserProject,
  Project,
  Query,
  Mutation,
} as IResolvers<any, Context>
