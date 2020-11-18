const cryptoRandomString = require('crypto-random-string')

import {Context} from '../../context';
import logger from '../../utils/logger';
import {esAnnotationByID} from '../../../esConnector';
import {ImageViewerLink, Annotation} from '../../binding';
import {ImageViewerLink as ImageViewerLinkModel} from './model'

export const Resolvers = {
  Query: {
    async imageViewerLink(_: any, {id, datasetId}: any, ctx: Context): Promise<ImageViewerLink | undefined> {
      const ivl = await ctx.entityManager.getRepository(ImageViewerLinkModel).findOne(id, datasetId);
      if (ivl) {
        const annotations = await Promise.all(ivl.annotationIds.map(id => esAnnotationByID(id, ctx.user)))
        return {
          ...ivl,
          snapshot: JSON.parse(ivl.snapshot),
          annotations: annotations.filter(a => a !== null) as unknown as Annotation[],
        }
      }
    },
  },
  Mutation: {
    async createImageViewerLink(_: any, {datasetId, ...input}: any, {user, entityManager}: Context): Promise<string> {

      logger.info(`Creating image viewer link for ${datasetId} dataset by '${user!.id}' user...`);

      const id = cryptoRandomString({ length: 8, type: 'url-safe' })

      const entity = {
        id,
        datasetId,
        ...input,
        userId: user.id
      }

      await entityManager.getRepository(ImageViewerLinkModel).save(entity);

      logger.info(`Image viewer link created with id ${id}`);
      return id;
    },
  }
}
