import { Context } from '../../../context'
import { QueryFilterArgs, QueryFilterResult } from './types'
import { EngineDataset } from '../../engine/model'
import { intersection } from 'lodash'

export const applyHasOpticalImageFilter =
async(context: Context, args: QueryFilterArgs): Promise<QueryFilterResult> => {
  const { datasetFilter, ...otherArgs } = args

  if (datasetFilter?.opticalImage !== undefined) {
    const { opticalImage, ...otherDatasetFilters } = datasetFilter
    const filterIds = datasetFilter?.ids ? datasetFilter?.ids.split('|') : undefined
    let qb = context.entityManager.getRepository(EngineDataset)
      .createQueryBuilder('dataset')

    if (opticalImage === true) {
      qb = qb.where('optical_image is not null')
    } else if (opticalImage === false) {
      qb = qb.where('optical_image is  null')
    }

    const opticalDatasets = await qb.getMany()
    const ids = filterIds
      ? intersection(filterIds, opticalDatasets.map((dataset: any) => dataset.id))
      : opticalDatasets.map((dataset: any) => dataset.id)

    return {
      args: {
        ...otherArgs,
        datasetFilter: {
          ...otherDatasetFilters,
          ids: ids.join('|'),
        },
      },
    }
  } else {
    return { args }
  }
}
