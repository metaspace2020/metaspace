import { FieldResolversFor } from '../../../bindingTypes'
import { ExperimentRegion as ExperimentRegionBinding } from '../../../binding'
import { Context } from '../../../context'
import { Roi, Segmentation } from '../../engine/model'

/**
 * Field resolvers for ExperimentRegion.
 *
 * The parent value is a JSONB blob persisted on `experiment_dataset.regions`,
 * shaped like `ExperimentRegionSpec` (see ../model.ts) — i.e. it carries
 * `roiId` / `segmentationId` rather than the resolved entities. We hydrate
 * `roi` and `segmentation` here by id.
 *
 * Parent type is `any` because the persisted shape (with `roiId`,
 * `segmentationId`) does not match the binding-generated `ExperimentRegion`
 * (with resolved `roi`, `segmentation`).
 */
const ExperimentRegionResolvers: FieldResolversFor<ExperimentRegionBinding, any> = {
  roi: async(parent, _args, ctx: Context) => {
    if (parent == null || parent.roiId == null) return null
    const roi = await ctx.entityManager.getRepository(Roi).findOne(String(parent.roiId))
    return (roi ?? null) as any
  },
  segmentation: async(parent, _args, ctx: Context) => {
    if (parent == null || parent.segmentationId == null) return null
    const segmentation = await ctx.entityManager
      .getRepository(Segmentation)
      .findOne(parent.segmentationId)
    return (segmentation ?? null) as any
  },
}

export default ExperimentRegionResolvers
