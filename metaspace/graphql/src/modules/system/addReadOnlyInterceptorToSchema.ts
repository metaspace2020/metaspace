import {GraphQLFieldResolver, GraphQLSchema} from 'graphql';
import {IResolverObject} from 'graphql-tools';
import * as _ from 'lodash';
import {UserError} from "graphql-errors";
import {getHealth} from './controller';

const mutationRequiresDatasetProcessing = (mutationName: string, args: any) => {
  return mutationName === 'createDataset'
    || mutationName === 'reprocessDataset'
    || (mutationName === 'updateDataset' && args.reprocess !== false)
};

export const preventMutationsIfReadOnly = (Mutation: Record<string, GraphQLFieldResolver<any, any>>): IResolverObject => {
  return _.mapValues(Mutation, (resolver: GraphQLFieldResolver<any, any>, key): GraphQLFieldResolver<any, any> => {

    if (!_.isFunction(resolver)) {
      throw new Error('filterMutations can\'t handle non-function resolvers')
    }

    if (key === 'updateSystemHealth') {
      return resolver;
    } else {
      return async (source: any, args: any, context: any, info: any) => {
        const {canMutate, canProcessDatasets, message} = await getHealth();

        if (!canMutate || (!canProcessDatasets && mutationRequiresDatasetProcessing(key, args))) {
          throw new UserError(JSON.stringify({ type: 'read_only_mode', message }));
        } else {
          return resolver(source, args, context, info);
        }
      }
    }
  })
};

const addReadOnlyInterceptorToSchema = (schema: GraphQLSchema) => {
  const Mutation = schema.getMutationType();
  if (Mutation != null) {
    Object.entries(Mutation.getFields()).forEach(([mutationName, field]) => {
      if (mutationName === 'updateSystemHealth' || field.resolve == null) {
        // Don't modify updateSystemHealth at all, so that it's possible to recover if the health is somehow broken.
        return;
      }

      const originalResolve = field.resolve;
      field.resolve = async function (source: any, args: any, context: any, info: any) {
        const {canMutate, canProcessDatasets, message} = await getHealth();

        if (!canMutate || (!canProcessDatasets && mutationRequiresDatasetProcessing(mutationName, args))) {
          throw new UserError(JSON.stringify({ type: 'read_only_mode', message }));
        } else {
          return originalResolve.apply(this, ...arguments);
        }
      }
    })
  }
};

export default addReadOnlyInterceptorToSchema;
