import { GraphQLSchema } from 'graphql'
import { AuthMethodOptions, Context } from '../../context'
import logger from '../../utils/logger'
import { UserError } from 'graphql-errors'
import { GraphQLFieldResolver } from 'graphql/type/definition'

const ALLOWED_MUTATIONS = new Set([
  'createDataset',
  'updateDataset',
  'deleteDataset',
  'reprocessDataset',
  'addOpticalImage',
  'copyRawOpticalImage',
  'addRoi',
  'deleteOpticalImage',
  'createProject',
  'updateProject',
  'importDatasetsIntoProject',
  'createReviewLink',
  'deleteReviewLink',
  'publishProject',
  'unpublishProject',
  'addDatasetExternalLink',
  'removeDatasetExternalLink',
  'addProjectExternalLink',
  'removeProjectExternalLink',
  'createMolecularDB',
  'updateMolecularDB',
  'deleteMolecularDB',
])

const wrapMutation = <TSource, TContext extends Context, TArgs>(
  mutationName: string,
  resolver: GraphQLFieldResolver<TSource, Context, TArgs>
): GraphQLFieldResolver<TSource, TContext, TArgs> => {
  return async function(this: any, source: TSource, args: TArgs, context: Context, info: any) {
    const { user, req } = context
    if (user.authMethod === AuthMethodOptions.API_KEY) {
      const callerIp = req && (req.headers['x-forwarded-for'] || req.connection.remoteAddress)

      if (ALLOWED_MUTATIONS.has(mutationName)) {
        try {
          const result = await resolver.call(this, source, args, context, info)
          logger.info(`API_KEY call from ${callerIp}: ${mutationName} success args: ${JSON.stringify(args)}`)
          return result
        } catch (ex) {
          logger.error(`API_KEY call from ${callerIp}: ${mutationName} error args: ${JSON.stringify(args)}`, ex)
          throw ex
        }
      } else {
        logger.info(`API_KEY call from ${callerIp}: ${mutationName} blocked args: ${JSON.stringify(args)}`)
        throw new UserError(JSON.stringify({
          type: 'unauthorized',
          message: 'This mutation cannot be called by API Key',
        }))
      }
    } else {
      return resolver.call(this, source, args, context, info)
    }
  }
}

const addApiKeyInterceptorToSchema = (schema: GraphQLSchema) => {
  const Mutation = schema.getMutationType()
  if (Mutation != null) {
    Object.entries(Mutation.getFields()).forEach(([mutationName, field]) => {
      if (field.resolve != null) {
        field.resolve = wrapMutation(mutationName, field.resolve)
      }
    })
  }
}

export default addApiKeyInterceptorToSchema
