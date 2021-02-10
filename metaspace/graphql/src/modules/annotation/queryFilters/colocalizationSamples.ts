import { Context } from '../../../context'
import { ColocJob, Ion } from '../model'
import { QueryFilterArgs, QueryFilterResult } from './types'
import config from '../../../utils/config'
import * as _ from 'lodash'
import { setOrMerge } from '../../../utils/setOrMerge'

const getColocSampleIons = async(context: Context, datasetId: string, fdrLevel: number, databaseId: number,
  colocalizationAlgo: string) => {
  const result = await context.entityManager.findOne(ColocJob,
    { datasetId, fdr: fdrLevel, moldbId: databaseId, algorithm: colocalizationAlgo },
    { select: ['sampleIonIds'] }
  )
  if (result == null) {
    return null
  } else {
    const ions = await context.entityManager.findByIds(Ion, result.sampleIonIds, { select: ['ion'] })
    return ions.map(({ ion }) => ion)
  }
}

export const applyColocalizationSamplesFilter =
  async(context: Context, args: QueryFilterArgs): Promise<QueryFilterResult> => {
    const datasetId = args.datasetFilter && args.datasetFilter.ids
    const { fdrLevel = 0.1, databaseId, colocalizationSamples = false } = args.filter || {}
    const colocalizationAlgo =
      args.filter && args.filter.colocalizationAlgo
      || config.metadataLookups.defaultColocalizationAlgo

    if (datasetId != null && colocalizationAlgo != null && colocalizationSamples) {
      const samples = await getColocSampleIons(context, datasetId, fdrLevel, databaseId!, colocalizationAlgo)
      if (samples != null) {
        return { args: setOrMerge(args, 'filter.ion', samples, _.intersection) }
      } else {
        return { args: setOrMerge(args, 'filter.ion', []) }
      }
    } else {
      return { args }
    }
  }
