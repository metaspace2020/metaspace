import {Context} from '../../../context';
import {QueryFilterArgs, QueryFilterResult} from './types';
import {esCountMatchingAnnotationsPerDataset} from '../../../../esConnector';
import * as _ from 'lodash';


export const applyHasAnnotationMatchingFilter =
  async (context: Context, args: QueryFilterArgs): Promise<QueryFilterResult> => {
    const {datasetFilter, ...otherArgs} = args;

    if (datasetFilter != null && datasetFilter.hasAnnotationMatching != null) {
      const {hasAnnotationMatching, ...otherDatasetFilters} = datasetFilter;
      const result = await esCountMatchingAnnotationsPerDataset({
        datasetFilter: otherDatasetFilters,
        // simpleQuery: args.simpleQuery,
        filter: hasAnnotationMatching,
      }, context.user);

      const datasetIds = Object.keys(result);
      const ids = otherDatasetFilters.ids
        ? _.intersection(datasetIds, otherDatasetFilters.ids.split('|')).join('|')
        : datasetIds.join('|');

      return {
        args: {
          ...otherArgs,
          datasetFilter: {
            ...otherDatasetFilters,
            ids,
          }
        },
      };
    } else {
      return { args };
    }
  };
