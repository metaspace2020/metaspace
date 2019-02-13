import * as _ from 'lodash';
import {Context} from '../../context';
import {ArgsFromBinding} from '../../bindingTypes';
import {Query} from '../../binding';
import {ColocAnnotation, ColocJob, Ion} from './model';
import {UserError} from 'graphql-errors';
import config from '../../utils/config';

type Args = ArgsFromBinding<Query['allAnnotations']>
          | ArgsFromBinding<Query['countAnnotations']>;
interface FilterResult {
  args: Args;
  postprocess?: any;
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
  ionsBySfAdduct: Map<string, Ion>;
}

const getColocAnnotation = async (context: Context, datasetId: string, fdrLevel: number, database: string | null,
                           colocalizedWith: string, colocalizationAlgo: string): Promise<AnnotationAndIons | null> => {
  const args = [datasetId, fdrLevel, database, colocalizedWith, colocalizationAlgo];
  return await context.contextCacheGet('getColocAnnotation', args, async () => {
    const annotation = await context.entityManager.createQueryBuilder(ColocAnnotation, 'colocAnnotation')
      .innerJoinAndSelect('colocAnnotation.colocJob', 'colocJob')
      .innerJoin(Ion, 'ion', 'colocAnnotation.ionId = ion.id')
      .where('colocJob.datasetId = :datasetId AND colocJob.fdr = :fdrLevel AND colocJob.molDb = :database ' +
        'AND colocJob.algorithm = :colocalizationAlgo AND ion.ion = :colocalizedWith',
        { datasetId, fdrLevel, database, colocalizationAlgo, colocalizedWith })
      .getOne();
    if (annotation != null) {
      const ions = await context.entityManager.findByIds(Ion, [annotation.ionId, ...annotation.colocIonIds]);
      return {
        annotation,
        ionsById: new Map<number, Ion>(ions.map(ion => [ion.id, ion] as [number, Ion])),
        ionsBySfAdduct: new Map<string, Ion>(ions.map(ion => [ion.formula + ion.adduct, ion] as [string, Ion])),
      };
    } else {
      return null;
    }
  });
};

const getColocSampleSfAdducts = async (context: Context, datasetId: string, fdrLevel: number, database: string | null,
                           colocalizationAlgo: string) => {
  const result = await context.entityManager.findOne(ColocJob,
    {datasetId, fdr: fdrLevel, molDb: database, algorithm: colocalizationAlgo},
    { select: ['sampleIonIds'] });
  if (result == null) {
    return [];
  } else {
    const ions = await context.entityManager.findByIds(Ion, result.sampleIonIds, {select: ['formula','adduct']});
    return ions.map(({formula, adduct}) => formula + adduct);
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
  let postprocess: any = null;


  if (datasetId != null && colocalizationAlgo != null && colocalizationSamples) {
    const samples = await getColocSampleSfAdducts(context, datasetId, fdrLevel, database, colocalizationAlgo);
    newArgs = setOrMerge(newArgs, 'filter.sfAdduct', samples, _.intersection);
  }

  if (datasetId != null && colocalizationAlgo != null && colocalizedWith != null) {
    const annotationAndIons = await getColocAnnotation(context, datasetId, fdrLevel, database, colocalizedWith, colocalizationAlgo);

    if (annotationAndIons != null) {
      const {annotation, ionsById, ionsBySfAdduct} = annotationAndIons;
      const {offset, limit} = args as ArgsFromBinding<Query['allAnnotations']>;
      const colocSfAdducts = _.uniq(annotation.colocIonIds)
        .map(ionId => {
          const ion = ionsById.get(ionId);
          return ion != null ? ion.formula + ion.adduct : null
        })
        .filter(sfAdduct => sfAdduct != null);

      newArgs = setOrMerge(newArgs, 'filter.sfAdduct', colocSfAdducts, _.intersection);
      if (offset != null) {
        newArgs = setOrMerge(newArgs, 'offset', 0);
      }
      if (limit != null) {
        newArgs = setOrMerge(newArgs, 'limit', 1000);
      }

      postprocess = (annotations: any[]): any[] => {
        let newAnnotations = annotations.map(ann => {
          const ion = ionsBySfAdduct.get(ann._source.sf_adduct);
          return {
            ...ann,
            _cachedColocCoeff: ion != null ? getColocCoeffInner(annotation, ion.id) : null,
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
          // TODO: Sorting gives incorrect results if there is more than 1 page of annotations
          const order = 'sortingOrder' in args && args.sortingOrder === 'ASCENDING' ? -1 : 1;
          newAnnotations.sort((a, b) => order * (b._cachedColocCoeff - a._cachedColocCoeff))
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
      newArgs = setOrMerge(newArgs, 'filter.sfAdduct', []);
    }
  }

  return {args: newArgs, postprocess};
};
