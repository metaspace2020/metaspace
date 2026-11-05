import { IResolvers } from 'graphql-tools'
import { Context } from '../../../context'
import Query from './Query'
import Mutation from './Mutation'
import ProjectSponsorship from './ProjectSponsorship'

export const Resolvers = { Query, Mutation, ProjectSponsorship } as IResolvers<any, Context>
