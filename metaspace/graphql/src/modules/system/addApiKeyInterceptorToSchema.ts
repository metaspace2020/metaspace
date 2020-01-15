import {GraphQLSchema} from 'graphql';
import {AuthMethodOptions, Context} from '../../context';
import logger from '../../utils/logger';
import {UserError} from "graphql-errors";

const ALLOWED_MUTATIONS = new Set([
  'createDataset',
  'updateDataset',
  'deleteDataset',
  'reprocessDataset',
  'addOpticalImage',
  'deleteOpticalImage',
  'createProject',
  'updateProject',
  'importDatasetsIntoProject',
  'createReviewLink',
  'deleteReviewLink',
  'publishProject',
  'unpublishProject',
]);

const addApiKeyInterceptorToSchema = (schema: GraphQLSchema) => {
  const Mutation = schema.getMutationType();
  if (Mutation != null) {
    Object.entries(Mutation.getFields()).forEach(([mutationName, field]) => {
      if (field.resolve == null) {
        return;
      }

      const originalResolve = field.resolve;
      field.resolve = async function (source: any, args: any, context: Context, info: any) {
        if (context.user.authMethod === AuthMethodOptions.API_KEY) {
          const callerIp = context.req
            && (context.req.headers['x-forwarded-for'] || context.req.connection.remoteAddress);
          if (ALLOWED_MUTATIONS.has(mutationName)) {
            try {
              const result = await originalResolve.apply(this, arguments as any);
              logger.info(`API_KEY call from ${callerIp}: ${mutationName} success args: ${JSON.stringify(args)}`);
              return result;
            } catch (ex) {
              logger.info(`API_KEY call from ${callerIp}: ${mutationName} error args: ${JSON.stringify(args)}`, ex);
              throw ex;
            }
          } else {
            logger.info(`API_KEY call from ${callerIp}: ${mutationName} blocked args: ${JSON.stringify(args)}`);
            throw new UserError(JSON.stringify({
              type: 'unauthorized',
              message: 'This mutation cannot be called by API Key',
            }));
          }
        } else {
          return originalResolve.apply(this, arguments as any);
        }
      }
    })
  }
};

export default addApiKeyInterceptorToSchema;
