import searchableFilterQueries, { SearchableFilterKey } from './searchableFilterQueries'
import graphqlClient, { initMockGraphqlClient } from '../../../../tests/utils/mockGraphqlClient'
import store from '../../../store'
import { sync } from 'vuex-router-sync'
import router from '../../../router'

describe('searchableFilterQueries', () => {
  beforeAll(() => {
    initMockGraphqlClient({})
    sync(store, router)
  })

  const validOption = expect.objectContaining({
    label: expect.any(String),
    value: expect.anything(),
  })

  const filterKeys = Object.keys(searchableFilterQueries) as SearchableFilterKey[]

  filterKeys.forEach((filterKey: SearchableFilterKey) => {
    describe(`['${filterKey}']`, () => {
      it('should be able to search with an empty query', async() => {
        const results = await searchableFilterQueries[filterKey].search(graphqlClient, store, '')

        expect(results).toBeInstanceOf(Array)
        // Can be empty, but if it has values ensure they are well-formed Options
        results.forEach(result => {
          expect(result).toEqual(validOption)
        })
      })
      it('should be able to search with a query', async() => {
        const results = await searchableFilterQueries[filterKey].search(graphqlClient, store, 'foo')

        expect(results).toBeInstanceOf(Array)
        expect(results.length).toBeGreaterThan(0)
        results.forEach(result => {
          expect(result).toEqual(validOption)
        })
      })
      it('should be able to look up options by ID', async() => {
        // 2 options because `datasetIds` uses a single query and the mocked resolver always returns 2 items
        const ids = ['1', '2']
        const results = await searchableFilterQueries[filterKey].getById(graphqlClient, ids)

        expect(results).toEqual([
          validOption,
          validOption,
        ])
      })
    })
  })
})
