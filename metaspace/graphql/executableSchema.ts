import {
  addErrorLoggingToSchema,
  addMockFunctionsToSchema,
  mergeSchemas
} from 'graphql-tools';
import {maskErrors} from 'graphql-errors';
import {mergeTypes} from 'merge-graphql-schemas';

import {logger} from './utils';
import config from './src/utils/config';
import {Resolvers as UserResolvers} from './src/modules/user/controller';
import {Resolvers as GroupResolvers} from './src/modules/group/controller';
import * as Resolvers from './resolvers';
import schema from './schema';

const executableSchema = mergeSchemas({
  schemas: [schema],
  resolvers: [
    Resolvers,
    UserResolvers,
    GroupResolvers
  ]
});

addErrorLoggingToSchema(executableSchema, logger);

if (config.features.graphqlMocks) {
  // TODO: Remove this when it's no longer needed for demoing
  // TODO: Add test that runs assertResolveFunctionsPresent against schema + resolvers
  addMockFunctionsToSchema({
    schema: executableSchema,
    preserveResolvers: true,
    mocks: {
      // Make IDs somewhat deterministic
      ID: (source, args, context, info) => {
        let idx: string|number = 0;
        let cur = info.path;
        while (cur != null) {
          if (/[0-9]+/.test(String(cur.key))) {
            idx = cur.key;
            break;
          }
          cur = cur.prev;
        }
        return `${info.parentType.name}_${idx}`;
      },
    }
  });
}

if (process.env.NODE_ENV !== 'development') {
  maskErrors(executableSchema);
}

export {executableSchema};