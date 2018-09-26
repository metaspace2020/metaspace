import * as path from 'path';
import * as fs from 'fs';
import * as _ from 'lodash';
import {promisify} from 'util';
import { pubsub } from '../../../utils';
import { IResolverObject } from 'graphql-tools/dist/Interfaces';
import { GraphQLFieldResolver } from 'graphql';
import {UserError} from 'graphql-errors';


interface SystemHealth { // TODO: Get from binding.ts after merge with master
  canMutate: Boolean;
  canProcessDatasets: Boolean;
  message: string | null;
}

interface UpdateSystemHealthInput { // TODO: Get from binding.ts after merge with master
  canMutate: Boolean;
  canProcessDatasets: Boolean;
  message: string | null;
}

interface Context { // TODO: Get from Context.ts after merge with master
  user?: {role: string}
}

const SYSTEM_HEALTH_CHANNEL = 'systemHealthUpdated';
const healthFile = path.join(path.dirname(require.main!.filename), 'health.json');
const defaultHealth: SystemHealth = {
  canMutate: true,
  canProcessDatasets: true,
  message: null,
};
const datasetProcessingMutations = [
  'createDataset',
  'updateDataset',
  'reprocessDataset',
];

let currentHealth: Promise<SystemHealth> = (async () => {
  try {
    return {
      ...defaultHealth,
      ...JSON.parse(await promisify(fs.readFile)(healthFile, 'utf8')),
    };
  } catch {
    return defaultHealth;
  }
})();

export const Resolvers = {
  Query: {
    async systemHealth(): Promise<SystemHealth> {
      return await currentHealth;
    },
  },

  Mutation: {
    async updateSystemHealth(source: void, {health}: {health: UpdateSystemHealthInput}, {user}: Context) {
      if (user && user.role === 'admin') {
        const newHealth = {...defaultHealth, ...health};
        currentHealth = Promise.resolve(newHealth);
        pubsub.publish(SYSTEM_HEALTH_CHANNEL, newHealth);

        // Don't persist to disk in development mode, as it triggers nodemon to restart the process
        if (process.env.NODE_ENV !== 'development') {
          if (_.isEqual(newHealth, defaultHealth)) {
            const fileExists = await promisify(fs.stat)(healthFile).then(() => true, () => false);
            if (fileExists) {
              await promisify(fs.unlink)(healthFile);
            }
          } else {
            await promisify(fs.writeFile)(healthFile, JSON.stringify(newHealth), 'utf-8');
          }
        }

        return null;
      } else {
        throw new UserError('Not authorized');
      }
    },
  },

  Subscription: {
    systemHealthUpdated: {
      subscribe: () => pubsub.asyncIterator<SystemHealth>(SYSTEM_HEALTH_CHANNEL),
      resolve: (payload: SystemHealth) => payload,
    },
  },
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
        const health = await currentHealth;
        const requiresDatasetProcesing = key === 'createDataset'
          || key === 'reprocessDataset'
          || (key === 'updateDataset' && args.reprocess !== false);

        if (!health.canMutate || (!health.canProcessDatasets && requiresDatasetProcesing)) {
          throw new UserError(JSON.stringify({ type: 'read_only_mode', message: health.message }));
        } else {
          return resolver(source, args, context, info);
        }
      }
    }
  })
};
