import { Context } from '../../../context'
import { QueryFilterArgs, QueryFilterResult } from './types'
import {
  EnrichmentBootstrap,
  EnrichmentDBMoleculeMapping as EnrichmentDBMoleculeMappingModel,
} from '../../enrichmentdb/model'
import { uniq } from 'lodash'
import { setOrMerge } from '../../../utils/setOrMerge'

export const applyEnrichmentTermFilter =
    async(context: Context, args: QueryFilterArgs): Promise<QueryFilterResult> => {
      const termId = args.filter && args.filter.termId
      const databaseId = args.filter && args.filter.databaseId
      if (termId) {
        let adducts: any = []

        const enrichmentTermsMapping = await context.entityManager.createQueryBuilder(EnrichmentDBMoleculeMappingModel,
          'mapping')
          .leftJoin('mapping.enrichmentTerm', 'terms')
          .select(['mapping.formula', 'mapping.id'])
          .distinct(true)
          .where('mapping.enrichmentTermId = :termId', { termId: termId })
          .getRawMany()
        const formulas = enrichmentTermsMapping.map((term: any) => term.mapping_formula)
        const ids : any = args?.datasetFilter?.ids

        // restrict to used adducts if dataset id filter passed (based on bootstrapping)
        if (ids && databaseId) {
          const bootstrap = await context.entityManager
            .createQueryBuilder(EnrichmentBootstrap,
              'bootstrap')
            .leftJoin('bootstrap.enrichmentDBMoleculeMapping', 'enrichmentDBMoleculeMapping')
            .select(['bootstrap.formulaAdduct'])
            .distinct(true)
            .where((qb : any) => {
              qb.where('bootstrap.datasetId  IN (:...ids)', { ids: ids.split('|') })
                .andWhere('bootstrap.enrichmentDbMoleculeMappingId  IN (:...termIds)',
                  { termIds: enrichmentTermsMapping.map((term: any) => term.mapping_id) })
                .andWhere('enrichmentDBMoleculeMapping.molecularDbId  = :dbId',
                  { dbId: databaseId })
            })
            .getRawMany()
          bootstrap.forEach((item: any) => {
            const auxAdduct : string = item.bootstrap_formula_adduct
            formulas.forEach((formula: any) => {
              if (auxAdduct.indexOf(formula) !== -1) {
                adducts.push(auxAdduct + '-') // add polarity
              }
            })
            return auxAdduct
          })
          adducts = uniq(adducts)
          return { args: setOrMerge(args, 'filter.ion', adducts) }
        }

        return { args: setOrMerge(args, 'filter.sumFormula', formulas) }
      }
      return { args }
    }
