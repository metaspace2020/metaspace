import { Vue } from 'vue/types/vue'
import apolloClient from '../api/graphqlClient'
import { DatasetDetailItem } from '../api/dataset'
import { VueApolloQueryOptions } from 'vue-apollo/types/options'

export const removeDatasetFromAllDatasetsQuery = (vm: Vue, queryName: string, datasetId: string) => {
  updateApolloCache(vm, queryName, oldVal => {
    if (oldVal.allDatasets != null && oldVal.allDatasets.some((ds: DatasetDetailItem) => ds.id === datasetId)) {
      return {
        ...oldVal,
        allDatasets: oldVal.allDatasets.filter((ds: DatasetDetailItem) => ds.id !== datasetId),
        countDatasets: oldVal.countDatasets && oldVal.countDatasets - 1,
      }
    }
    return oldVal
  })
}

/**
 * Updates a vue-apollo smart query's results in the Apollo cache.
 * @param vm         Instance of the component that holds the query.
 * @param queryName  Name of the query in the component.
 * @param update     A function that is called with the currently cached value, and should return either an updated value
 *                   or undefined. It should not directly modify the value it is called with - it should make and return
 *                   a copy.
 */
const updateApolloCache = (vm: Vue, queryName: string, update: (value: any) => any) => {
  let { query, variables } = (vm.$apollo.queries[queryName] as any).options as VueApolloQueryOptions<any, any>
  if (query instanceof Function) query = query.call(vm)
  if (variables instanceof Function) variables = variables.call(vm)
  let oldVal: any
  try {
    oldVal = apolloClient.readQuery({ query, variables })
  } catch (err) {
    // Ignore - readQuery throws an error if the query hasn't been executed yet
  }
  if (oldVal != null) {
    const newVal = update(oldVal)
    if (newVal !== undefined && newVal !== oldVal) {
      apolloClient.writeQuery({ query, variables, data: newVal })
    }
  }
}

export default updateApolloCache
