import * as _ from 'lodash';
import {Context} from '../../context';
import {ArgsFromBinding} from '../../bindingTypes';
import {Query} from '../../binding';
import {ColocAnnotation, ColocJob, Ion} from './model';
import {UserError} from 'graphql-errors';
import config from '../../utils/config';
import {ESAnnotation} from '../../../esConnector';

type Args = (ArgsFromBinding<Query['allAnnotations']>
          | ArgsFromBinding<Query['countAnnotations']>);
interface FilterResult {
  args: Args;
  postprocess?(annotations: ESAnnotation[]): ESAnnotationWithColoc[] ;
}

export interface ESAnnotationWithColoc extends ESAnnotation {
  _cachedColocCoeff: number | null;
  _isColocReference: boolean;
  getColocalizationCoeff(_colocalizedWith: string, _colocalizationAlgo: string,
                         _database: string, _fdrLevel: number): Promise<number | null>;
}

const setOrMerge = <T>(obj: any, path: string, value: T, onConflict = (val: T, oldVal: T) => val) => {
  let newVal = value;
  if (_.hasIn(obj, path)) {
    const oldVal = _.get(obj, path);
    newVal = onConflict(value, oldVal);
  }
  return _.merge({}, obj, _.set({}, path, newVal));
};

interface AnnotationAndIons {
  annotation: ColocAnnotation;
  ionsById: Map<number, Ion>;
  lookupIon: (formula: string, chemMod: string, neutralLoss: string, adduct: string) => Ion | undefined;
}

const getColocAnnotation = async (context: Context, datasetId: string, fdrLevel: number, database: string | null,
                           colocalizedWith: string, colocalizationAlgo: string): Promise<AnnotationAndIons | null> => {
  const args = [datasetId, fdrLevel, database, colocalizedWith, colocalizationAlgo] as const;
  return await context.contextCacheGet('getColocAnnotation', args,
    async (datasetId, fdrLevel, database, colocalizedWith, colocalizationAlgo) => {
      const annotation = await context.entityManager.createQueryBuilder(ColocAnnotation, 'colocAnnotation')
        .innerJoinAndSelect('colocAnnotation.colocJob', 'colocJob')
        .innerJoin(Ion, 'ion', 'colocAnnotation.ionId = ion.id')
        .where('colocJob.datasetId = :datasetId AND colocJob.fdr = :fdrLevel AND colocJob.molDb = :database ' +
          'AND colocJob.algorithm = :colocalizationAlgo AND ion.ion = :colocalizedWith',
          { datasetId, fdrLevel, database, colocalizationAlgo, colocalizedWith })
        .getOne();
      if (annotation != null) {
        const ions = await context.entityManager.findByIds(Ion, [annotation.ionId, ...annotation.colocIonIds]);
        const ionsByFormula = _.groupBy(ions, 'formula');
        return {
          annotation,
          ionsById: new Map<number, Ion>(ions.map(ion => [ion.id, ion] as [number, Ion])),
          lookupIon: (formula: string, chemMod: string, neutralLoss: string, adduct: string) => {
            return (ionsByFormula[formula] || [])
              .find(ion => ion.chemMod === chemMod && ion.neutralLoss === neutralLoss && ion.adduct === adduct);
          },
        };
      } else {
        return null;
      }
    });
};

const getColocSampleIons = async (context: Context, datasetId: string, fdrLevel: number, database: string | null,
                           colocalizationAlgo: string) => {
  const result = await context.entityManager.findOne(ColocJob,
    {datasetId, fdr: fdrLevel, molDb: database, algorithm: colocalizationAlgo},
    { select: ['sampleIonIds'] });
  if (result == null) {
    return null;
  } else {
    const ions = await context.entityManager.findByIds(Ion, result.sampleIonIds, {select: ['ion']});
    return ions.map(({ion}) => ion);
  }
};

const getColocCoeffInner = (baseAnnotation: ColocAnnotation, otherIonId: number) => {
  const { ionId, colocIonIds, colocCoeffs } = baseAnnotation;

  if (otherIonId === ionId) {
    return 1; // Same molecule
  } else {
    const coeff_idx = colocIonIds.indexOf(otherIonId);
    if (coeff_idx !== -1) {
      return colocCoeffs[coeff_idx];
    } else {
      return null;
    }
  }
};


/**
 * Apply filters based on data that's not available in ElasticSearch by finding the matching data in postgres,
 * then using it to add additional filters to the ElasticSearch query. Some filters may also require that extra data
 * is added to the found annotations for other resolvers to use.
 *
 * When the datasetId is provided, ES can easily handle large numbers of arguments in "terms" queries.
 * Querying with 28000 valid values of sfAdduct ran in 55ms. It would cost a significant amount of disk space to
 * index colocalized molecules, so filtering only in postgres seems to be the better option.
 * */
export const applyQueryFilters = async (context: Context, args: Args): Promise<FilterResult> => {

  const datasetId = args.datasetFilter && args.datasetFilter.ids;
  const {
    fdrLevel = 0.1,
    database = null,
    colocalizedWith = null,
    colocalizationSamples = false,
  } = args.filter || {};
  const colocalizationAlgo =
    args.filter && args.filter.colocalizationAlgo
    || config.metadataLookups.defaultColocalizationAlgo;
  let newArgs = args;
  let postprocess: FilterResult['postprocess'];


  if (datasetId != null && colocalizationAlgo != null && colocalizationSamples) {
    const samples = await getColocSampleIons(context, datasetId, fdrLevel, database, colocalizationAlgo);
    if (samples != null) {
      newArgs = setOrMerge(newArgs, 'filter.ion', samples, _.intersection);
    } else {
      newArgs = setOrMerge(newArgs, 'filter.ion', []);
    }
  }

  if (datasetId != null && colocalizationAlgo != null && colocalizedWith != null) {
    const annotationAndIons = await getColocAnnotation(context, datasetId, fdrLevel, database, colocalizedWith, colocalizationAlgo);

    if (annotationAndIons != null) {
      const {annotation, ionsById, lookupIon} = annotationAndIons;
      const {offset, limit} = args as ArgsFromBinding<Query['allAnnotations']>;
      const colocIons = _.uniq([annotation.ionId, ...annotation.colocIonIds])
        .map(ionId => {
          const ion = ionsById.get(ionId);
          return ion != null ? ion.ion : null
        })
        .filter(ion => ion != null);

      newArgs = setOrMerge(newArgs, 'filter.ion', colocIons, _.intersection);
      // Always select 1000 annotations so that sorting by colocalizationCoeff doesn't just sort per-page
      newArgs = setOrMerge(newArgs, 'offset', 0);
      newArgs = setOrMerge(newArgs, 'limit', 1000);

      postprocess = (annotations: ESAnnotation[]): ESAnnotationWithColoc[] => {
        let newAnnotations: ESAnnotationWithColoc[] = annotations.map(ann => {
          const ion = lookupIon(ann._source.formula, ann._source.chem_mod, ann._source.neutral_loss, ann._source.adduct);
          return {
            ...ann,
            _cachedColocCoeff: ion != null ? getColocCoeffInner(annotation, ion.id) : null,
            _isColocReference: ion != null && ion.id === annotation.ionId,
            async getColocalizationCoeff(_colocalizedWith: string, _colocalizationAlgo: string, _database: string, _fdrLevel: number) {
              if (_colocalizedWith === colocalizedWith && _colocalizationAlgo === colocalizationAlgo && _database === database && _fdrLevel === fdrLevel) {
                return this._cachedColocCoeff;
              } else {
                throw new UserError('colocalizationCoeff arguments must match the parent allAnnotations filter values');
                // return getColocCoeff(context, datasetId, _colocalizedWith, ann._source.sf_adduct, _colocalizationAlgo, _database, _fdrLevel)
              }
            },
          }
        });

        if (!('orderBy' in args) || args.orderBy === 'ORDER_BY_COLOCALIZATION') {
          const order = 'sortingOrder' in args && args.sortingOrder === 'ASCENDING' ? 1 : -1;

          newAnnotations = _.sortBy(newAnnotations, ann => {
            if (ann._isColocReference) {
              // Always show reference annotations as the most colocalized,
              // even if there are other annotations with a 1.0 colocalizationCoeff
              return Infinity * order;
            } else {
              return (ann._cachedColocCoeff != null ? ann._cachedColocCoeff : -1) * order;
            }
          })
        }
        if (offset) {
          newAnnotations = newAnnotations.slice(offset);
        }
        if (limit) {
          newAnnotations = newAnnotations.slice(0, limit);
        }

        return newAnnotations;
      }
    } else {
      newArgs = setOrMerge(newArgs, 'filter.ion', []);
    }
  }

  return {args: newArgs, postprocess};
};
