// ElasticSearch must be mocked before importing any other graphql code. It uses doMock so that it can reference
// MockElasticSearchClient without jest's "jest.mock hoisting" causing problems.
class MockElasticSearchClient {
  static search = jest.fn()
  search = MockElasticSearchClient.search
}
jest.doMock('@elastic/elasticsearch', () => ({ Client: MockElasticSearchClient }))

jest.mock('../../../utils/redis')
jest.mock('../../plan/util/usageCreditsApi')

import isRateLimited from '../../../utils/redis'
import { consumeUsageCredit } from '../../plan/util/usageCreditsApi'
import { createTestDataset } from '../../../tests/testDataCreation'
import {
  doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testEntityManager,
  testUser,
} from '../../../tests/graphqlTestEnvironment'
import { Dataset } from '../model'
import { getContextForTest } from '../../../getContext'

const mockIsRateLimited = isRateLimited as jest.Mock
const mockConsumeUsageCredit = consumeUsageCredit as jest.Mock

describe('Dataset.downloadLinkJson usage credits', () => {
  let dataset: Dataset

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    dataset = await createTestDataset()

    // Minimum ES fields for the dataset query + canDownloadDataset (public → viewable);
    // no ds_input_path so the S3 listing is skipped and files come back empty.
    MockElasticSearchClient.search.mockImplementation(() =>
      ({ hits: { hits: [{ _source: { ds_id: dataset.id, ds_is_public: true } }] } })
    )
    mockIsRateLimited.mockReset()
    mockConsumeUsageCredit.mockReset()
    mockConsumeUsageCredit.mockResolvedValue(false)
  })
  afterEach(onAfterEach)

  const query = `query downloadLink($datasetId: String!) {
    dataset (id: $datasetId) { downloadLinkJson }
  }`

  const makeContext = () => {
    const context = getContextForTest(testUser as any, testEntityManager)
    // downloadLinkJson only consults the rate limiter when a redis client is present
    ;(context.req as any).sessionStore = { client: {} }
    return context
  }

  test('rate-limited user with a credit gets the download', async() => {
    mockIsRateLimited.mockResolvedValue(true)
    mockConsumeUsageCredit.mockResolvedValue(true)

    const ds = await doQuery(query, { datasetId: dataset.id }, { context: makeContext() })
    const result = JSON.parse(ds.downloadLinkJson)

    expect(result.message).toBeUndefined()
    expect(result.files).toEqual([])
    expect(mockConsumeUsageCredit).toHaveBeenCalledTimes(1)
    expect(mockConsumeUsageCredit).toHaveBeenCalledWith(testUser.id, 'download', 'dataset')
  })

  test('rate-limited user without credits stays blocked', async() => {
    mockIsRateLimited.mockResolvedValue(true)
    mockConsumeUsageCredit.mockResolvedValue(false)

    const ds = await doQuery(query, { datasetId: dataset.id }, { context: makeContext() })
    const result = JSON.parse(ds.downloadLinkJson)

    expect(result.message).toMatch(/Download limit reached/)
    expect(mockConsumeUsageCredit).toHaveBeenCalledTimes(1)
  })

  test('un-rate-limited download never consumes a credit', async() => {
    mockIsRateLimited.mockResolvedValue(false)

    const ds = await doQuery(query, { datasetId: dataset.id }, { context: makeContext() })
    const result = JSON.parse(ds.downloadLinkJson)

    expect(result.files).toEqual([])
    expect(mockConsumeUsageCredit).not.toHaveBeenCalled()
  })

  test('rate-limited user who cannot view the dataset never consumes a credit', async() => {
    // Private dataset the test user has no relation to: checkIfPublishedOrUnderReview is
    // false, but the user is signed in so the resolver proceeds past the sign-in guard;
    // canViewEsDataset (and therefore canDownloadDataset) is false.
    MockElasticSearchClient.search.mockImplementation(() =>
      ({ hits: { hits: [{ _source: { ds_id: dataset.id, ds_is_public: false } }] } })
    )
    mockIsRateLimited.mockResolvedValue(true)

    const ds = await doQuery(query, { datasetId: dataset.id }, { context: makeContext() })
    const result = JSON.parse(ds.downloadLinkJson)

    expect(result.message).toMatch(/Download limit reached/)
    expect(mockConsumeUsageCredit).not.toHaveBeenCalled()
  })
})
