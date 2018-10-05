import {
  addMockFunctionsToSchema,
  makeExecutableSchema,
} from 'graphql-tools';
import {maskErrors} from 'graphql-errors';
import {mergeTypes} from 'merge-graphql-schemas';
import config from './src/utils/config';
import {Resolvers as UserResolvers} from './src/modules/user/controller';
import {Resolvers as GroupResolvers} from './src/modules/group/controller';
import {Resolvers as SystemResolvers} from './src/modules/system/controller';
import {Resolvers as ProjectResolvers} from './src/modules/project/controller';
import * as Resolvers from './resolvers';
import {mergedSchemas} from './schema';
import addReadOnlyInterceptorToSchema from './src/modules/system/addReadOnlyInterceptorToSchema';
import {Context} from './src/context';
import {ResponsePath} from 'graphql';

const executableSchema = makeExecutableSchema<Context>({
  typeDefs: mergedSchemas,
  resolvers: [
    Resolvers,
    UserResolvers,
    GroupResolvers,
    ProjectResolvers,
    SystemResolvers,
  ],
});

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
        let cur: ResponsePath | undefined = info.path;
        while (cur != null) {
          if (/[0-9]+/.test(String(cur.key))) {
            idx = cur.key;
            break;
          }
          cur = cur.prev;
        }
        return `${info.parentType.name}_${idx}`;
      },
    },
  });
}

if (process.env.NODE_ENV !== 'development') {
  maskErrors(executableSchema);
}

addReadOnlyInterceptorToSchema(executableSchema);

export {executableSchema};
