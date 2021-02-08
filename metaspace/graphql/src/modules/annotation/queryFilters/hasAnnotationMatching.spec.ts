jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'
import {
  anonContext,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
} from '../../../tests/graphqlTestEnvironment'
import { applyQueryFilters } from './index'
import { QueryFilterArgs } from './types'

const mockEsConnector = _mockEsConnector as jest.Mocked<typeof _mockEsConnector>

describe('annotation/queryFilters hasAnnotationMatching', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(onBeforeEach)
  afterEach(onAfterEach)

  it('should add dataset ID filters when "hasAnnotationMatching" filter is used', async() => {
    const inputArgs: QueryFilterArgs = {
      datasetFilter: {
        hasAnnotationMatching: { compoundQuery: 'H2SO4' },
        polarity: 'NEGATIVE',
      },
    }
    mockEsConnector.esCountMatchingAnnotationsPerDataset.mockReturnValueOnce(Promise.resolve({
      DS1: 123,
      DS2: 123,
    }))

    const { args } = await applyQueryFilters(anonContext, inputArgs)

    expect(args).toMatchObject({
      datasetFilter: { ids: 'DS1|DS2', polarity: 'NEGATIVE' },
    } as any)
    expect(mockEsConnector.esCountMatchingAnnotationsPerDataset).toHaveBeenCalledWith({
      datasetFilter: { polarity: 'NEGATIVE' },
      filter: { compoundQuery: 'H2SO4' },
    }, expect.anything())
  })
})
