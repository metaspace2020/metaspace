import Mutation from './Mutation'
import Query from './Query'
import Experiment from './Experiment'
import ExperimentDataset from './ExperimentDataset'
import ExperimentRegion from './ExperimentRegion'
import ExperimentResultRow from './ExperimentResultRow'
import { IResolvers } from 'graphql-tools'
import { Context } from '../../../context'

export const Resolvers = {
  Mutation, Query, Experiment, ExperimentDataset, ExperimentRegion, ExperimentResultRow,
} as IResolvers<any, Context>
