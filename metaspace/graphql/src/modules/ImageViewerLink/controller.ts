const cryptoRandomString = require('crypto-random-string')

import {Context} from '../../context';
import {ImageViewerLink} from './model'
import logger from '../../utils/logger';

export const Resolvers = {
  Query: {
    async imageViewerLink(_: any, {id, datasetId}: any, ctx: Context): Promise<ImageViewerLink | undefined> {
      return await ctx.entityManager.getRepository(ImageViewerLink).findOne(id, datasetId);
    },
  },
  Mutation: {
    async createImageViewerLink(_: any, {datasetId, state, annotationIds}: any, {user, entityManager}: Context): Promise<string> {

      logger.info(`Creating image viewer link for ${datasetId} dataset by '${user!.id}' user...`);

      const id = cryptoRandomString({ length: 8, type: 'url-safe' })

      const entity = {
        id,
        datasetId,
        state,
        annotationIds,
        userId: user.id
      }

      await entityManager.getRepository(ImageViewerLink).save(entity);

      logger.info(`Image viewer link created with id ${id}`);
      return id;
    },
  }
}
