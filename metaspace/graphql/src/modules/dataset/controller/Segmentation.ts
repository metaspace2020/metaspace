import { Context } from '../../../context'
import { ImageSegmentationJob } from '../../engine/model'

const SegmentationResolvers = {
  async stale(source: any, _args: any, ctx: Context) {
    if (typeof source.stale === 'boolean') return source.stale
    if (source.jobId == null) return false
    const latest = await ctx.entityManager
      .createQueryBuilder(ImageSegmentationJob, 'j')
      .where('j.datasetId = :datasetId', { datasetId: source.datasetId })
      .andWhere('j.status = \'FINISHED\'')
      .orderBy('j.createdAt', 'DESC')
      .limit(1)
      .getOne()
    return latest != null && source.jobId !== latest.id
  },
}

export default SegmentationResolvers
