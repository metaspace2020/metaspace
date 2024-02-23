import { getCurrentInstance } from 'vue'
import { useApolloClient } from '@vue/apollo-composable'

/**
 * Updates a vue-apollo smart query's results in the Apollo cache.
 * @param vm         Instance of the component that holds the query.
 * @param queryName  Name of the query in the component.
 * @param update     A function that is called with the currently cached value, and should return either an updated value
 *                   or undefined. It should not directly modify the value it is called with - it should make and return
 *                   a copy.
 */
const updateApolloCache = (queryName, update) => {
  const vm: any = getCurrentInstance().proxy
  const apolloClient = useApolloClient().client
  const { query, variables } = vm.$apollo.queries[queryName].options

  let oldVal = null
  try {
    oldVal = apolloClient.readQuery({ query, variables })
  } catch (err) {
    console.error('Error reading query:', err)
  }

  if (oldVal) {
    const newVal = update(oldVal)
    if (newVal !== undefined && newVal !== oldVal) {
      apolloClient.writeQuery({ query, variables, data: newVal })
    }
  }
}

export const removeDatasetFromAllDatasetsQuery = (queryName, datasetId) => {
  updateApolloCache(queryName, (oldVal) => {
    if (oldVal?.allDatasets?.some((ds) => ds.id === datasetId)) {
      return {
        ...oldVal,
        allDatasets: oldVal.allDatasets.filter((ds) => ds.id !== datasetId),
        countDatasets: oldVal.countDatasets - 1,
      }
    }
    return oldVal
  })
}

export default updateApolloCache
