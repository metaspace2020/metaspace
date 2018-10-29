import {mergeTypes} from 'merge-graphql-schemas';
import {mergeSchemas, makeExecutableSchema} from 'graphql-tools';
import * as fs from 'fs';

export const mergedSchemas = mergeTypes([
  fs.readFileSync('schema.graphql', 'utf8'),
  fs.readFileSync('schemas/dataset.graphql', 'utf8'),
  fs.readFileSync('schemas/user.graphql', 'utf8'),
  fs.readFileSync('schemas/group.graphql', 'utf8'),
  fs.readFileSync('schemas/project.graphql', 'utf8'),
  fs.readFileSync('schemas/system.graphql', 'utf8'),
]);

export default mergeSchemas({
  schemas: [
    makeExecutableSchema({typeDefs: mergedSchemas})
  ]
});

