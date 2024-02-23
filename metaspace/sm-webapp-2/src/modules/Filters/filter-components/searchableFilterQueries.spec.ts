import store from '../../../store' // Ensure correct path
import searchableFilterQueries, { SearchableFilterKey } from './searchableFilterQueries'
import { ApolloClient, InMemoryCache, ApolloLink, Observable } from '@apollo/client/core'

const filterKeys = Object.keys(searchableFilterQueries) as SearchableFilterKey[]

const validOption = expect.objectContaining({
  label: expect.any(String),
  value: expect.anything(),
})

const datasetOptions = {
  options: [
    {
      id: '1',
      label: 'foo',
      value: '2',
    },
    {
      id: '2',
      label: 'foo',
      value: '1',
    },
  ],
}

const mockLink = new ApolloLink((operation) => {
  return new Observable((observer) => {
    // Here, you can intercept the operation (query/mutation) and provide mock responses
    const { operationName } = operation
    let result

    switch (operationName) {
      case 'GroupOptionById':
        result = {
          data: { group: datasetOptions.options[0] },
        }
        break
      case 'ProjectOptionById':
        result = {
          data: { project: datasetOptions.options[0] },
        }
        break
      case 'SubmitterOptionById':
        result = {
          data: { user: datasetOptions.options[0] },
        }
        break
      default:
        result = {
          data: datasetOptions,
        } // Default empty result or some error
    }

    observer.next(result)
    observer.complete()
    return () => {}
  })
})

// Create a mock Apollo client
const mockClient = new ApolloClient({
  cache: new InMemoryCache(),
  link: mockLink,
})

describe('searchableFilterQueries', () => {
  filterKeys.forEach((filterKey: SearchableFilterKey) => {
    it('should be able to search with an empty query', async () => {
      const results = await searchableFilterQueries[filterKey].search(mockClient, store, '')
      expect(results).toBeInstanceOf(Array)
      results.forEach((result) => {
        expect(result).toEqual(validOption)
      })
    })
    it('should be able to search with a query', async () => {
      const results = await searchableFilterQueries[filterKey].search(mockClient, store, 'foo')

      expect(results).toBeInstanceOf(Array)
      expect(results.length).toBeGreaterThan(0)
      results.forEach((result) => {
        expect(result).toEqual(validOption)
      })
    })
    it('should be able to look up options by ID', async () => {
      // 2 options because `datasetIds` uses a single query and the mocked resolver always returns 2 items
      const ids = ['1', '2']
      const results = await searchableFilterQueries[filterKey].getById(mockClient, ids)

      expect(results).toEqual([validOption, validOption])
    })
  })
})
