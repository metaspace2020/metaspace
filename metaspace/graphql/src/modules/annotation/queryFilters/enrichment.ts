import { Context } from '../../../context'
import { QueryFilterArgs, QueryFilterResult } from './types'
import {
  EnrichmentBootstrap,
} from '../../enrichmentdb/model'
import { uniq } from 'lodash'
import { setOrMerge } from '../../../utils/setOrMerge'
import { MolecularDB as MolecularDbModel } from '../../moldb/model'

export const applyEnrichmentTermFilter =
    async(context: Context, args: QueryFilterArgs): Promise<QueryFilterResult> => {
      const termId = args.filter && args.filter.termId
      let databaseId = args.filter && args.filter.databaseId
      const ids : any = args?.datasetFilter?.ids
      const fdrLevel : any = args.filter?.fdrLevel || 0.1

      if (termId) {
        let adducts: any = []
        if (!databaseId) {
          const defaultDatabase = await context.entityManager.findOneOrFail(
            MolecularDbModel, { default: true }
          )
          databaseId = defaultDatabase.id
        }

        const bootstrap = await context.entityManager
          .createQueryBuilder(EnrichmentBootstrap,
            'bootstrap')
          .innerJoin('bootstrap.enrichmentDBMoleculeMapping', 'enrichmentDBMoleculeMapping')
          .innerJoin('enrichmentDBMoleculeMapping.enrichmentTerm', 'enrichmentTerm')
          .select(['bootstrap.annotationId', 'bootstrap.datasetId'])
          .distinct(true)
          .where((qb : any) => {
            qb.where('enrichmentTerm.id  = :termId', { termId })
            if (ids) {
              qb.andWhere('bootstrap.datasetId  IN (:...ids)', { ids: ids.split('|') })
            }
            qb.andWhere('enrichmentDBMoleculeMapping.molecularDbId  = :dbId', { dbId: databaseId })
            qb.andWhere('bootstrap.fdr  <= :fdrLevel', { fdrLevel })
          })
          .getRawMany()

        adducts = uniq(bootstrap.map((item: any) => `${item.bootstrap_dataset_id}_${item.bootstrap_annotation_id}`))
        return { args: setOrMerge(args, 'filter.annotationId', adducts.join('|')) }
      }

      return { args }
    }
