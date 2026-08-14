import { FieldResolversFor } from '../../../bindingTypes'
import { ExperimentDataset as ExperimentDatasetBinding } from '../../../binding'
import { ExperimentDataset as ExperimentDatasetEntity } from '../model'
import { Context } from '../../../context'
import { esDatasetByID } from '../../../../esConnector'

const ExperimentDatasetResolvers: FieldResolversFor<ExperimentDatasetBinding, ExperimentDatasetEntity> = {
  regionSource: (parent) => parent.regionSource.toUpperCase(),
  regions: (parent) => parent.regions ?? [],
  dataset: async(parent, _, ctx: Context) => {
    return (await esDatasetByID(parent.datasetId, ctx.user)) as any
  },
}

export default ExperimentDatasetResolvers
