import { Context } from '../../../context'
import { QueryFilterArgs, QueryFilterResult } from './types'
import {
  EnrichmentBootstrap,
  EnrichmentDBMoleculeMapping as EnrichmentDBMoleculeMappingModel,
} from '../../enrichmentdb/model'
import { uniq } from 'lodash'

export const applyEnrichmentTermFilter =
    async(context: Context, args: QueryFilterArgs): Promise<QueryFilterResult> => {
      const { filter, datasetFilter, ...otherArgs } = args

      if (filter?.termId) {
        let adducts: any = []

        const enrichmentTermsMapping = await context.entityManager.createQueryBuilder(EnrichmentDBMoleculeMappingModel,
          'mapping')
          .leftJoin('mapping.enrichmentTerm', 'terms')
          .select(['mapping.formula', 'mapping.id'])
          .distinct(true)
          .where('mapping.enrichmentTermId = :termId', { termId: filter.termId })
          .getRawMany()
        const formulas = enrichmentTermsMapping.map((term: any) => term.mapping_formula)

        // restrict to used adducts if dataset id filter passed (based on bootstrapping)
        if (datasetFilter?.ids) {
          const bootstrap = await context.entityManager
            .createQueryBuilder(EnrichmentBootstrap,
              'bootstrap')
            .leftJoin('bootstrap.enrichmentDBMoleculeMapping', 'enrichmentDBMoleculeMapping')
            .select(['bootstrap.formulaAdduct'])
            .distinct(true)
            .where((qb : any) => {
              qb.where('bootstrap.datasetId  IN (:...ids)', { ids: datasetFilter?.ids?.split('|') })
                .andWhere('bootstrap.enrichmentDbMoleculeMappingId  IN (:...termIds)',
                  { termIds: enrichmentTermsMapping.map((term: any) => term.mapping_id) })
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
          return {
            args: {
              ...otherArgs,
              ...datasetFilter,
              filter: {
                ...filter,
                ion: adducts.join('|'),
              },
            },
          }
        }

        return {
          args: {
            ...otherArgs,
            ...datasetFilter,
            filter: {
              ...filter,
              sumFormula: formulas.join('|'),
            },
          },
        }
      }
      return { args }
    }
