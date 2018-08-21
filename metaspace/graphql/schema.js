const {makeExecutableSchema, addResolveFunctionsToSchema} = require('graphql-tools'),
  { buildSchema } = require('graphql'),
  { mergeTypes } = require('merge-graphql-schemas'),
  fs = require('fs');

const mergedSchema = mergeTypes([
  fs.readFileSync('schema.graphql', 'utf8'),
  fs.readFileSync('schemas/user.graphql', 'utf8'),
  fs.readFileSync('schemas/group.graphql', 'utf8'),
]);
const schema = buildSchema(mergedSchema);

module.exports = schema;
