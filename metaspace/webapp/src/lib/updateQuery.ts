import {Vue} from 'vue/types/vue';
import apolloClient from '../graphqlClient';
import {DatasetDetailItem} from '../api/dataset';

export const removeDatasetFromAllDatasetsQuery = (vm: Vue, queryName: string, datasetId: string) => {
  updateQuery(vm, queryName, oldVal => {
    if (oldVal.allDatasets != null && oldVal.allDatasets.some((ds: DatasetDetailItem) => ds.id === datasetId)) {
      return {
        ...oldVal,
        allDatasets: oldVal.allDatasets.filter((ds: DatasetDetailItem) => ds.id !== datasetId),
        countDatasets: oldVal.countDatasets && oldVal.countDatasets - 1,
      };
    }
    return oldVal;
  });
};

const updateQuery = (vm: Vue, queryName: string, update: (value: any) => any) => {
  let {query, variables} = vm.$apollo.queries[queryName].options;
  if (query instanceof Function) query = query.call(vm);
  if (variables instanceof Function) variables = variables.call(vm);
  let oldVal: any;
  try {
    oldVal = apolloClient.readQuery({ query, variables });
  } catch (err) {
    // Ignore - readQuery throws an error if the query hasn't been executed yet
  }
  if (oldVal != null) {
    const newVal = update(oldVal);
    if (newVal !== undefined && newVal !== oldVal) {
      apolloClient.writeQuery({ query, variables, data: newVal });
    }
  }
};

export default updateQuery;
