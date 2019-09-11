import {Context} from '../../../context';
import {Args, FilterResult, PostProcessFunc} from './types';
import {applyColocalizationSamplesFilter} from './colocalizationSamples';
import {applyColocalizedWithFilter} from './colocalizedWith';
import * as _ from 'lodash';

export {ESAnnotationWithColoc} from './types';

const queryFilters = [
  applyColocalizationSamplesFilter,
  applyColocalizedWithFilter,
];

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
  let newArgs = args;
  let postprocessFuncs: PostProcessFunc[] = [];

  for (const filter of queryFilters) {
    const result = await filter(context, newArgs);
    newArgs = result.args;
    if (result.postprocess != null) {
      postprocessFuncs.push(result.postprocess);
    }
  }

  return { args: newArgs, postprocess: _.flow(postprocessFuncs) };
};

