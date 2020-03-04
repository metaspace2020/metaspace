import { defaultDataIdFromObject, InMemoryCache } from 'apollo-client-preset'

const nonNormalizableTypes: any[] = ['User', 'DatasetUser', 'DatasetGroup', 'DatasetProject']
export const makeApolloCache = () => new InMemoryCache({
  cacheRedirects: {
    Query: {
      // Allow get-by-id queries to use cached data that originated from other kinds of queries
      dataset: (_, args, { getCacheKey }) => getCacheKey({ __typename: 'Dataset', id: args.id }),
      annotation: (_, args, { getCacheKey }) => getCacheKey({ __typename: 'Annotation', id: args.id }),
      group: (_, args, { getCacheKey }) => getCacheKey({ __typename: 'Group', id: args.groupId }),
      project: (_, args, { getCacheKey }) => getCacheKey({ __typename: 'Project', id: args.projectId }),
    },
  },
  dataIdFromObject(object: any) {
    // WORKAROUND: Because of Apollo's aggressive caching, often the current User will be overwritten with results
    // from other queries. The server side often strips fields based on how they're accessed (the "ScopeRole" logic),
    // which means these query paths will often return different data with the same IDs:
    // currentUser -> primaryGroup (always present)
    // dataset -> submitter -> primaryGroup (null unless admin)
    // To protect against this, don't allow Users (and possibly other types in the future) to have a dataId,
    // so that InMemoryCache cannot share data between different queries.
    if (nonNormalizableTypes.includes(object.__typename)) {
      return null
    } else {
      return defaultDataIdFromObject(object)
    }
  },
})
