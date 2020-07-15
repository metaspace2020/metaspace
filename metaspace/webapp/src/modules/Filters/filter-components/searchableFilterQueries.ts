import gql from 'graphql-tag'
import { omit } from 'lodash-es'
import { MolecularDB } from '../../../api/moldb'
import { formatDatabaseLabel } from '../../MolecularDatabases/formatting'

export interface Option {
  value: string;
  label: string;
}
export interface FilterQueries {
  search($apollo: any, $store: any, query: string): Promise<Option[]>;
  getById($apollo: any, ids: string[]): Promise<Option[]>;
}

export type SearchableFilterKey = 'database' | 'datasetIds' | 'group' | 'project' | 'submitter';

const datasetQueries: FilterQueries = {
  async search($apollo, $store, query) {
    const { data } = await $apollo.query({
      query: gql`query DatasetOptions($filter: DatasetFilter!, $orderBy: DatasetOrderBy, $sortingOrder: SortingOrder) {
        options: allDatasets(filter: $filter, orderBy: $orderBy, sortingOrder: $sortingOrder, limit: 20) {
         id
         value: id
         label: name
        }
      }`,
      fetchPolicy: 'cache-first',
      variables: {
        filter: {
          ...omit($store.getters.gqlDatasetFilter, 'ids'),
          ...(query ? { name: query } : {}),
          status: 'FINISHED',
        },
        orderBy: query ? 'ORDER_BY_NAME' : 'ORDER_BY_DATE',
        sortingOrder: query ? 'ASCENDING' : 'DESCENDING',
      },
    })
    return data.options as Option[]
  },
  async getById($apollo, ids) {
    const { data } = await $apollo.query({
      query: gql`query DatasetNames($ids: String) {
        options: allDatasets(filter: {ids: $ids}) {
          id
          value: id
          label: name
        }
      }`,
      fetchPolicy: 'cache-first',
      variables: { ids: ids.join('|') },
    })
    return data.options as Option[]
  },
}

const groupQueries: FilterQueries = {
  async search($apollo, $store, query) {
    if (query) {
      const { data } = await $apollo.query({
        query: gql`query GroupOptions($query: String!) {
        options: allGroups(query: $query, limit: 20) {
         id
         value: id
         label: name
        }
      }`,
        fetchPolicy: 'cache-first',
        variables: { query },
      })
      return data.options as Option[]
    } else {
      const { data: { currentUser } } = await $apollo.query({
        query: gql`query MyGroupOptions {
          currentUser {
            id
            groups {
              group {
                id
                value: id
                label: name
              }
            }
          }
        }`,
        fetchPolicy: 'cache-first',
      })
      return (currentUser
        && currentUser.groups
        && currentUser.groups.map((userGroup: any) => userGroup.group))
        || [] as Option[]
    }
  },
  async getById($apollo, ids) {
    const promises = ids.map(groupId => $apollo.query({
      query: gql`query GroupOptionById ($groupId: ID!) {
        group(groupId: $groupId) {
         id
         value: id
         label: name
        }
      }`,
      fetchPolicy: 'cache-first',
      variables: { groupId },
    }))
    const results = await Promise.all(promises)
    return results
      .filter((result: any) => result.data.group != null)
      .map((result: any) => result.data.group as Option)
  },
}

const projectQueries: FilterQueries = {
  async search($apollo, $store, query) {
    if (query) {
      const { data } = await $apollo.query({
        query: gql`query ProjectOptions ($query: String!) {
        options: allProjects(query: $query, limit: 20) {
         id
         value: id
         label: name
        }
      }`,
        fetchPolicy: 'cache-first',
        variables: { query },
      })
      return data.options as Option[]
    } else {
      const { data: { currentUser } } = await $apollo.query({
        query: gql`query MyProjectOptions {
          currentUser {
            id
            projects {
              project {
                id
                value: id
                label: name
              }
            }
          }
        }`,
        fetchPolicy: 'cache-first',
      })
      return (currentUser
      && currentUser.projects
        && currentUser.projects.map((userProject: any) => userProject.project))
        || [] as Option[]
    }
  },
  async getById($apollo, ids) {
    const promises = ids.map(projectId => $apollo.query({
      query: gql`query ProjectOptionById ($projectId: ID!) {
        project(projectId: $projectId) {
         id
         value: id
         label: name
        }
      }`,
      fetchPolicy: 'cache-first',
      variables: { projectId },
    }))
    const results = await Promise.all(promises)
    return results
      .filter((result: any) => result.data.project != null)
      .map((result: any) => result.data.project as Option)
  },
}

const submitterQueries: FilterQueries = {
  async search($apollo, $store, query) {
    if (query) {
      const { data } = await $apollo.query({
        query: gql`query SubmitterOptions ($query: String!) {
        options: submitterSuggestions(query: $query) {
         id
         value: id
         label: name
        }
      }`,
        fetchPolicy: 'cache-first',
        variables: { query },
      })
      return data.options as Option[]
    } else {
      const { data: { currentUser } } = await $apollo.query({
        query: gql`query MySubmitterOptions {
          currentUser {
            id
            label: name
            primaryGroup {
              group {
                id
                members {
                  user {
                    id
                    value: id
                    label: name
                  }
                }
              }
            }
          }
        }`,
        fetchPolicy: 'cache-first',
      })
      if (currentUser) {
        const meOption = { value: currentUser.id, label: currentUser.label }
        const peerOptions = currentUser.primaryGroup && currentUser.primaryGroup.group.members
          && currentUser.primaryGroup.group.members.map((member: any) => member.user) || []
        return [
          meOption,
          ...peerOptions.filter((option: Option) => option.value !== currentUser.id && !!option.label),
        ]
      } else {
        return []
      }
    }
  },
  async getById($apollo, ids) {
    const promises = ids.map(userId => $apollo.query({
      query: gql`query SubmitterOptionById ($userId: ID!) {
        user(userId: $userId) {
         id
         value: id
         label: name
        }
      }`,
      fetchPolicy: 'cache-first',
      variables: { userId },
    }))
    const results = await Promise.all(promises)
    return results
      .filter((result: any) => result.data.user != null)
      .map((result: any) => result.data.user as Option)
  },
}

function mapDBtoOption(db: MolecularDB): Option {
  return {
    value: db.id ? (db.id).toString() : '',
    label: formatDatabaseLabel(db),
  }
}

const databaseQueries: FilterQueries = {
  async search($apollo, $store, query) {
    const { data } = await $apollo.query({
      query: gql`query DatabaseOptions {
        molecularDatabases {
          id
          name
          version
        }
      }`,
      fetchPolicy: 'cache-first',
    })
    const queryRegex = new RegExp(query, 'i')
    const results: Option[] = []
    for (const db of data.molecularDatabases) {
      if (queryRegex.test(db.name) || queryRegex.test(db.version)) {
        results.push(mapDBtoOption(db))
      }
    }
    return results
  },
  async getById($apollo, ids) {
    const { data } = await $apollo.query({
      query: gql`query DatabaseNames {
        molecularDatabases {
          id
          name
          version
        }
      }`,
      fetchPolicy: 'cache-first',
    })

    const parsedIds = ids.map(id => parseInt(id, 10))
    const results: Option[] = []
    for (const db of data.molecularDatabases) {
      if (parsedIds.includes(db.id)) {
        results.push(mapDBtoOption(db))
      }
    }
    return results
  },
}

const searchableFilterQueries: Record<SearchableFilterKey, FilterQueries> = {
  database: databaseQueries,
  datasetIds: datasetQueries,
  group: groupQueries,
  project: projectQueries,
  submitter: submitterQueries,
}

export default searchableFilterQueries
