import * as cryptoRandomString from 'crypto-random-string'
import { utc } from 'moment'

import { Context } from '../../context'
import logger from '../../utils/logger'
import { esAnnotationByID, esAnnotationByIon } from '../../../esConnector'
import { ImageViewerSnapshot, Annotation } from '../../binding'
import { ImageViewerSnapshot as ImageViewerSnapshotModel } from './model'
import { unpackAnnotation } from '../annotation/controller/Query'

export const Resolvers = {
  Query: {
    async imageViewerSnapshot(_: any, { id, datasetId }: any, ctx: Context): Promise<ImageViewerSnapshot | null> {
      const ivs = await ctx.entityManager.getRepository(ImageViewerSnapshotModel).findOne({ id, datasetId })
      if (ivs) {
        // kept the ids query for now, in case there are permalinks without ionFormula even after the migration
        // i.e when the job does not exist anymore to extract the ion from the id
        const annotation = (ann : any) : any => { return ann !== null ? unpackAnnotation(ann) : null }
        let annotations = ivs.ionFormulas && ivs.dbIds
          ? await Promise.all(ivs.ionFormulas.map((ion, idx) => (esAnnotationByIon(ion, datasetId,
              ivs.dbIds[idx], ctx.user))))
          : await Promise.all(ivs.annotationIds.map(id => (esAnnotationByID(id, ctx.user))))
        annotations = annotations.map((ann) => annotation(ann))
        return {
          ...ivs,
          annotations: annotations.filter(a => a !== null) as unknown as Annotation[],
        }
      }
      return null
    },
  },
  Mutation: {
    async saveImageViewerSnapshot(_: any, { input }: any, { user, entityManager }: Context): Promise<string> {
      logger.info(`Saving image viewer snapshot for ${input.datasetId} dataset by '${user.id}' user...`)

      const id = cryptoRandomString({ length: 8, type: 'url-safe' })

      const entity = {
        id,
        ...input,
        userId: user.id,
        createdDT: utc(),
      }

      await entityManager.getRepository(ImageViewerSnapshotModel).save(entity)

      logger.info(`Image viewer snapshot saved with id ${id}`)
      return id
    },
  },
}
