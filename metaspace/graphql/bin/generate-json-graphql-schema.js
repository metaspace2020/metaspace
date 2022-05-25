const { makeExecutableSchema } = require('graphql-tools')
const { mergeTypes } = require('merge-graphql-schemas')
const { graphql, introspectionQuery } = require('graphql')
const { promisify } = require('util')
const { resolve } = require('path')
const readFile = promisify(require('fs').readFile)
const writeFile = promisify(require('fs').writeFile)

// FIXME: Most of this file is redundant now that `schema.ts` exists in the parent directory.

const schemaFiles = [
  // NOTE: This list should be kept in sync with ../schema.ts
  '../schemas/lookups.graphql',
  '../schemas/annotation.graphql',
  '../schemas/dataset.graphql',
  '../schemas/user.graphql',
  '../schemas/group.graphql',
  '../schemas/project.graphql',
  '../schemas/system.graphql',
  '../schemas/moldb.graphql',
  '../schemas/imageViewerSnapshot.graphql',
  '../schemas/enrichmentdb.graphql',
]

const run = async(outputFile) => {
  const filePromises = schemaFiles.map(file => readFile(resolve(__dirname, file), 'utf8'))
  const typeDefs = mergeTypes(await Promise.all(filePromises))
  const schema = makeExecutableSchema({ typeDefs })
  const introspectedSchema = await graphql(schema, introspectionQuery)
  await writeFile(outputFile, JSON.stringify(introspectedSchema))
  // For .graphql schema:
  // await writeFile(outputFile, printSchema(introspectedSchema));
}

if (process.argv.length !== 3) {
  throw new Error('Run this script with just 1 argument: the output file path')
} else {
  run(process.argv[2]).catch(console.error)
}
