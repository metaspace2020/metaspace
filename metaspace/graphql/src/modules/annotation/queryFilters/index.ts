import { Context } from '../../../context'
import { QueryFilterArgs, QueryFilterResult, PostProcessFunc } from './types'
import { applyColocalizationSamplesFilter } from './colocalizationSamples'
import { applyEnrichmentTermFilter } from './enrichment'
import { applyColocalizedWithFilter } from './colocalizedWith'
import { applyHasOpticalImageFilter } from './hasOpticalImage'
import * as _ from 'lodash'
import { applyHasAnnotationMatchingFilter } from './hasAnnotationMatching'
import { mapDatabaseToDatabaseId } from '../../moldb/util/mapDatabaseToDatabaseId'
import { AnnotationFilter } from '../../../binding'
import { EntityManager } from 'typeorm'

export { ESAnnotationWithColoc } from './types'

const queryFilters = [
  applyColocalizationSamplesFilter,
  applyColocalizedWithFilter,
  applyHasAnnotationMatchingFilter,
  applyHasOpticalImageFilter,
  applyEnrichmentTermFilter,
]

const setDatabaseIdInAnnotationFilter = async(entityManager: EntityManager, filter: AnnotationFilter | undefined) => {
  if (filter != null) {
    if (filter.databaseId == null && filter.database != null) {
      filter.databaseId = await mapDatabaseToDatabaseId(entityManager, filter.database)
    }
  }
}

/**
 * Augment filters based on data that's not easily queryable in ElasticSearch, e.g. data that is only available in
 * postgres, or data that requires multiple queries in ElasticSearch. Some filters may also require that extra data
 * is added to the found annotations for other resolvers to use.
 *
 * When the datasetId is provided, ES can easily handle large numbers of arguments in "terms" queries.
 * Querying with 28000 valid values of sfAdduct ran in 55ms. It would cost a significant amount of disk space to
 * index colocalized molecules, so filtering only in postgres seems to be the better option.
 * */
export const applyQueryFilters = async(context: Context, args: QueryFilterArgs): Promise<QueryFilterResult> => {
  let newArgs = args
  const postprocessFuncs: PostProcessFunc[] = []

  await setDatabaseIdInAnnotationFilter(context.entityManager, newArgs.filter)
  if (newArgs.datasetFilter) {
    await setDatabaseIdInAnnotationFilter(context.entityManager, newArgs.datasetFilter.hasAnnotationMatching)
  }

  for (const filter of queryFilters) {
    const result = await filter(context, newArgs)
    if (result.args != null) {
      newArgs = result.args
    }
    if (result.postprocess != null) {
      postprocessFuncs.push(result.postprocess)
    }
  }

  return { args: newArgs, postprocess: _.flow(postprocessFuncs) }
}
