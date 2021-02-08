import { Context } from '../../../context'
import config from '../../../utils/config'
import * as _ from 'lodash'
import { ESAnnotation } from '../../../../esConnector'
import { UserError } from 'graphql-errors'
import { QueryFilterArgs, ESAnnotationWithColoc, QueryFilterResult } from './types'
import { ColocAnnotation, Ion } from '../model'
import { setOrMerge } from '../../../utils/setOrMerge'

interface AnnotationAndIons {
  annotation: ColocAnnotation;
  ionsById: Map<number, Ion>;
  lookupIon: (formula: string, chemMod: string, neutralLoss: string, adduct: string) => Ion | undefined;
}

const getColocAnnotation = async(context: Context, datasetId: string, fdrLevel: number, databaseId: number | null,
  colocalizedWith: string, colocalizationAlgo: string): Promise<AnnotationAndIons | null> => {
  const args = [datasetId, fdrLevel, databaseId, colocalizedWith, colocalizationAlgo] as const
  return await context.contextCacheGet('getColocAnnotation', args,
    async(datasetId, fdrLevel, databaseId, colocalizedWith, colocalizationAlgo) => {
      const annotation = await context.entityManager.createQueryBuilder(ColocAnnotation, 'colocAnnotation')
        .innerJoinAndSelect('colocAnnotation.colocJob', 'colocJob')
        .innerJoin(Ion, 'ion', 'colocAnnotation.ionId = ion.id')
        .where('colocJob.datasetId = :datasetId AND colocJob.fdr = :fdrLevel AND colocJob.moldbId = :databaseId '
          + 'AND colocJob.algorithm = :colocalizationAlgo AND ion.ion = :colocalizedWith',
        { datasetId, fdrLevel, databaseId, colocalizationAlgo, colocalizedWith })
        .getOne()
      if (annotation != null) {
        const ions = await context.entityManager.findByIds(Ion, [annotation.ionId, ...annotation.colocIonIds])
        const ionsByFormula = _.groupBy(ions, 'formula')
        return {
          annotation,
          ionsById: new Map<number, Ion>(ions.map(ion => [ion.id, ion] as [number, Ion])),
          lookupIon: (formula: string, chemMod: string, neutralLoss: string, adduct: string) => {
            return (ionsByFormula[formula] || [])
              .find(ion => ion.chemMod === chemMod && ion.neutralLoss === neutralLoss && ion.adduct === adduct)
          },
        }
      } else {
        return null
      }
    })
}

const getColocCoeffInner = (baseAnnotation: ColocAnnotation, otherIonId: number) => {
  const { ionId, colocIonIds, colocCoeffs } = baseAnnotation

  if (otherIonId === ionId) {
    return 1 // Same molecule
  } else {
    const coeff_idx = colocIonIds.indexOf(otherIonId)
    if (coeff_idx !== -1) {
      return colocCoeffs[coeff_idx]
    } else {
      return null
    }
  }
}

const createPostprocess = ({ annotation, lookupIon }: AnnotationAndIons, args: QueryFilterArgs,
  colocalizedWith: string, colocalizationAlgo: string, databaseId: number | null,
  fdrLevel: number | null) => {
  return (annotations: ESAnnotation[]): ESAnnotationWithColoc[] => {
    let newAnnotations: ESAnnotationWithColoc[] = annotations.map(ann => {
      const ion = lookupIon(ann._source.formula, ann._source.chem_mod, ann._source.neutral_loss, ann._source.adduct)
      return {
        ...ann,
        _cachedColocCoeff: ion != null ? getColocCoeffInner(annotation, ion.id) : null,
        _isColocReference: ion != null && ion.id === annotation.ionId,
        getColocalizationCoeff(
          _colocalizedWith: string,
          _colocalizationAlgo: string,
          _databaseId: number,
          _fdrLevel: number | null
        ) {
          if (_colocalizedWith === colocalizedWith
            && _colocalizationAlgo === colocalizationAlgo
            && _databaseId === databaseId
            && _fdrLevel === fdrLevel) {
            return this._cachedColocCoeff
          } else {
            throw new UserError('colocalizationCoeff arguments must match the parent allAnnotations filter values')
            // return getColocCoeff(context, datasetId, _colocalizedWith, ann._source.sf_adduct, _colocalizationAlgo, _database, _fdrLevel)
          }
        },
      }
    })

    if (args.orderBy === undefined || args.orderBy === 'ORDER_BY_COLOCALIZATION') {
      const order = 'sortingOrder' in args && args.sortingOrder === 'ASCENDING' ? 1 : -1

      newAnnotations = _.sortBy(newAnnotations, ann => {
        if (ann._isColocReference) {
          // Always show reference annotations as the most colocalized,
          // even if there are other annotations with a 1.0 colocalizationCoeff
          return Infinity * order
        } else {
          return (ann._cachedColocCoeff != null ? ann._cachedColocCoeff : -1) * order
        }
      })
    }
    if (args.offset) {
      newAnnotations = newAnnotations.slice(args.offset)
    }
    if (args.limit) {
      newAnnotations = newAnnotations.slice(0, args.limit)
    }

    return newAnnotations
  }
}

export const applyColocalizedWithFilter =
  async(context: Context, args: QueryFilterArgs): Promise<QueryFilterResult> => {
    const datasetId = args.datasetFilter && args.datasetFilter.ids
    const {
      fdrLevel = 0.1,
      databaseId = null,
      colocalizedWith = null,
    } = args.filter || {}
    const colocalizationAlgo =
      args.filter && args.filter.colocalizationAlgo
      || config.metadataLookups.defaultColocalizationAlgo
    let newArgs = args

    if (datasetId != null && colocalizationAlgo != null && colocalizedWith != null) {
      const annotationAndIons = await getColocAnnotation(
        context, datasetId, fdrLevel, databaseId, colocalizedWith, colocalizationAlgo
      )
      if (annotationAndIons != null) {
        const { annotation, ionsById } = annotationAndIons
        const colocIons = _.uniq([annotation.ionId, ...annotation.colocIonIds])
          .map(ionId => {
            const ion = ionsById.get(ionId)
            return ion != null ? ion.ion : null
          })
          .filter(ion => ion != null)

        newArgs = setOrMerge(newArgs, 'filter.ion', colocIons, _.intersection)
        // Always select 1000 annotations so that sorting by colocalizationCoeff doesn't just sort per-page
        newArgs = setOrMerge(newArgs, 'offset', 0)
        newArgs = setOrMerge(newArgs, 'limit', 1000)

        return {
          args: newArgs,
          postprocess: createPostprocess(
            annotationAndIons, args, colocalizedWith, colocalizationAlgo, databaseId, fdrLevel
          ),
        }
      } else {
        return { args: setOrMerge(newArgs, 'filter.ion', []) }
      }
    } else {
      return { args }
    }
  }
