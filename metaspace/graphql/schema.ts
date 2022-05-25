import { mergeTypes } from 'merge-graphql-schemas'
import { mergeSchemas, makeExecutableSchema } from 'graphql-tools'
import * as fs from 'fs'

export const mergedSchemas = mergeTypes([
  // NOTE: This list should be kept in sync with bin/generate-json-graphql-schema.js
  fs.readFileSync('schemas/lookups.graphql', 'utf8'),
  fs.readFileSync('schemas/annotation.graphql', 'utf8'),
  fs.readFileSync('schemas/enrichmentdb.graphql', 'utf8'),
  fs.readFileSync('schemas/dataset.graphql', 'utf8'),
  fs.readFileSync('schemas/user.graphql', 'utf8'),
  fs.readFileSync('schemas/group.graphql', 'utf8'),
  fs.readFileSync('schemas/project.graphql', 'utf8'),
  fs.readFileSync('schemas/system.graphql', 'utf8'),
  fs.readFileSync('schemas/moldb.graphql', 'utf8'),
  fs.readFileSync('schemas/imageViewerSnapshot.graphql', 'utf8'),
])

export default mergeSchemas({
  schemas: [
    makeExecutableSchema({ typeDefs: mergedSchemas }),
  ],
})
