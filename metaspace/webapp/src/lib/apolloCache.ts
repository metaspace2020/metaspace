import { defaultDataIdFromObject, InMemoryCache } from '@apollo/client/core'

const nonNormalizableTypes: any[] = ['User', 'DatasetUser', 'DatasetGroup', 'DatasetProject']
export const makeApolloCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          dataset: {
            keyArgs: false,
            read(_, { args, toReference }) {
              return toReference({ __typename: 'Dataset', id: args?.id })
            },
          },
          annotation: {
            keyArgs: false,
            read(_, { args, toReference }) {
              return toReference({ __typename: 'Annotation', id: args?.id })
            },
          },
          group: {
            keyArgs: false,
            read(_, { args, toReference }) {
              return toReference({ __typename: 'Group', id: args?.groupId })
            },
          },
          project: {
            keyArgs: false,
            read(_, { args, toReference }) {
              return toReference({ __typename: 'Project', id: args?.projectId })
            },
          },
        },
      },
    },
    dataIdFromObject(object) {
      // WORKAROUND: Because of Apollo's aggressive caching, often the current User will be overwritten with results
      // from other queries. The server side often strips fields based on how they're accessed (the "ScopeRole" logic),
      // which means these query paths will often return different data with the same IDs:
      // currentUser -> primaryGroup (always present)
      // dataset -> submitter -> primaryGroup (null unless admin)
      // To protect against this, don't allow Users (and possibly other types in the future) to have a dataId,
      // so that InMemoryCache cannot share data between different queries.
      if (nonNormalizableTypes.includes(object.__typename)) {
        return false
      } else {
        return defaultDataIdFromObject(object)
      }
    },
  })
