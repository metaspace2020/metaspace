// ElasticSearch must be mocked before importing any other graphql code. It uses doMock so that it can reference
// MockElasticSearchClient without jest's "jest.mock hoisting" causing problems.
class MockElasticSearchClient {
  static search = jest.fn()
  search = MockElasticSearchClient.search
}
jest.doMock('@elastic/elasticsearch', () => ({ Client: MockElasticSearchClient }))

import {
  adminContext,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach, setupTestUsers,
  testEntityManager,
} from '../../../tests/graphqlTestEnvironment'

import {
  createTestMolecularDB,
  createTestPlan,
  createTestPlanRule, createTestUser,
} from '../../../tests/testDataCreation'
import { getContextForTest } from '../../../getContext'

describe('Dataset plan checks', () => {
  let originalDateNow: any
  let database: any
  let proPlan: any
  let regularPlan: any
  let testUserReg: any
  let testUserReg2: any
  let testUserPro: any

  // Helpers
  const setMockDate = (dateString: string) => {
    Date.now = jest.fn(() => new Date(dateString).getTime())
  }

  const mockElasticsearchResponse = (datasetId: string, userId: string) => {
    MockElasticSearchClient.search.mockImplementationOnce(() => ({
      hits: {
        hits: [{ _source: { ds_id: datasetId, ds_is_public: true, ds_submitter_id: userId } }],
      },
    }))
  }

  const sampleMetadata = {
    Data_Type: 'Imaging MS',
    MS_Analysis: {
      Analyzer: 'FTICR',
      Polarity: 'Positive',
      Ionisation_Source: 'MALDI',
      Detector_Resolving_Power: {
        mz: 400,
        Resolving_Power: 140000,
      },
      Pixel_Size: { Xaxis: 50, Yaxis: 50 },
    },
    Submitted_By: {
      Submitter: {
        Email: 'user@example.com',
        Surname: 'Surname',
        First_Name: 'Name',
      },
      Institution: 'Genentech',
      Principal_Investigator: {
        Email: 'pi@example.com',
        Surname: 'Surname',
        First_Name: 'Name',
      },
    },
    Sample_Information: {
      Organism: 'Mus musculus (mouse)',
      Condition: 'Dosed vs. vehicle',
      Organism_Part: 'EMT6 Tumors',
      Sample_Growth_Conditions: 'NA',
    },
    Sample_Preparation: {
      MALDI_Matrix: '2,5-dihydroxybenzoic acid (DHB)',
      Tissue_Modification: 'N/A',
      Sample_Stabilisation: 'Fresh frozen',
      MALDI_Matrix_Application: 'TM sprayer',
    },
    Additional_Information: {
      Publication_DOI: 'NA',
      Expected_Molecules_Freetext: 'tryptophan pathway',
      Sample_Preparation_Freetext: 'NA',
      Additional_Information_Freetext: 'NA',
    },
  }

  beforeAll(async() => {
    await onBeforeAll()
    originalDateNow = Date.now
    setMockDate('2024-10-30T10:00:00Z')
  })

  afterAll(async() => {
    await onAfterAll()
    Date.now = originalDateNow
  })

  beforeEach(async() => {
    jest.clearAllMocks()
    await onBeforeEach()
    await setupTestUsers()

    regularPlan = await createTestPlan({
      name: 'regular',
      isActive: true,
    })
    proPlan = await createTestPlan({
      name: 'pro',
      isActive: true,
    })

    await createTestPlanRule({
      planId: regularPlan.id,
      actionType: 'create',
      period: 1,
      periodType: 'hour',
      limit: 0,
      type: 'dataset',
      visibility: 'private',
    })

    await createTestPlanRule({
      planId: regularPlan.id,
      actionType: 'download',
      period: 1,
      periodType: 'day',
      limit: 2,
      type: 'dataset',
      visibility: 'public',
    })

    await createTestPlanRule({
      planId: proPlan.id,
      actionType: 'create',
      period: 1,
      periodType: 'hour',
      limit: 1,
      type: 'dataset',
      visibility: 'private',
    })

    database = await createTestMolecularDB({ name: 'HMDB-v4', isPublic: true, groupId: null })
    testUserReg = await createTestUser({ planId: regularPlan.id })
    testUserReg2 = await createTestUser({ planId: regularPlan.id })
    testUserPro = await createTestUser({ planId: proPlan.id })
  })

  afterEach(onAfterEach)

  const createDatasetQuery = `mutation createDataset($databaseIds: [Int!], $isPublic: Boolean) {
      createDataset(
        input: {
          name: "ds-name"
          inputPath: "input-path"
          databaseIds: $databaseIds          
          metadataJson: ${JSON.stringify(JSON.stringify(sampleMetadata))}
          adducts: ["+H"]
          isPublic: $isPublic
          submitterId: ""
        }
      )
    }`

  const datasetDownloadLink = `query getDatasetDownloadLink($datasetId: String!) {
      dataset(id: $datasetId) {
        downloadLinkJson
      }
  }`

  const createAndMockDataset = async(time: string, context: any, user: any) => {
    setMockDate(time)
    const dataset = await doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: true },
      { context })
    mockElasticsearchResponse(JSON.parse(dataset).datasetId, user.id)
    return dataset
  }

  it('should not be able to create private dataset as a regular', async() => {
    const context = getContextForTest({ ...testUserReg }, testEntityManager)
    await expect(doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: false }, { context })).rejects.toThrow('Limit reached')
  })

  it('should be able to create private dataset as a pro', async() => {
    const context = getContextForTest({ ...testUserPro }, testEntityManager)
    await expect(doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: false }, { context })).resolves.not.toThrow()
  })

  it('should not be able to create private dataset, but can create as many public as a regular', async() => {
    const context = getContextForTest({ ...testUserReg }, testEntityManager)
    await expect(doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: true }, { context })).resolves.not.toThrow()
    setMockDate('2024-10-30T10:01:00Z')
    await expect(doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: true }, { context })).resolves.not.toThrow()
    setMockDate('2024-10-30T10:02:00Z')
    await expect(doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: false }, { context })).rejects.toThrow('Limit reached')
  })

  it('should be able to download only 2 datasets per day as a regular not owner', async() => {
    const context = getContextForTest({ ...testUserReg }, testEntityManager)
    const context2 = getContextForTest({ ...testUserReg2 }, testEntityManager)

    const ds1 = await createAndMockDataset('2024-10-30T10:03:00Z', context, testUserReg)
    const download1 = await doQuery(datasetDownloadLink, { datasetId: JSON.parse(ds1).datasetId }, { context: context2 })

    const ds2 = await createAndMockDataset('2024-10-30T10:04:00Z', context, testUserReg)
    const download2 = await doQuery(datasetDownloadLink, { datasetId: JSON.parse(ds2).datasetId }, { context: context2 })

    const ds3 = await createAndMockDataset('2024-10-30T10:05:00Z', context, testUserReg)
    const download3 = await doQuery(datasetDownloadLink, { datasetId: JSON.parse(ds3).datasetId }, { context: context2 })

    // verify download limits
    expect(JSON.parse(download1.downloadLinkJson)).not.toHaveProperty('message')
    expect(JSON.parse(download2.downloadLinkJson)).not.toHaveProperty('message')
    expect(JSON.parse(download3.downloadLinkJson)).toEqual(expect.objectContaining({
      message: expect.any(String),
    }))

    // Should be able to download again after 24 hours
    const ds4 = await createAndMockDataset('2024-10-30T10:06:00Z', context, testUserReg)
    Date.now = jest.fn(() => new Date('2024-10-31T11:05:00Z').getTime())
    const download4 = await doQuery(datasetDownloadLink, { datasetId: JSON.parse(ds4).datasetId }, { context: context2 })
    expect(JSON.parse(download4.downloadLinkJson)).not.toHaveProperty('message')
  })

  it('should not be able to download 2 datasets per day as a dataset owner', async() => {
    const context = getContextForTest({ ...testUserReg }, testEntityManager)

    const ds1 = await createAndMockDataset('2024-10-30T10:03:00Z', context, testUserReg)
    const download1 = await doQuery(datasetDownloadLink, { datasetId: JSON.parse(ds1).datasetId }, { context: context })

    const ds2 = await createAndMockDataset('2024-10-30T10:04:00Z', context, testUserReg)
    const download2 = await doQuery(datasetDownloadLink, { datasetId: JSON.parse(ds2).datasetId }, { context: context })

    const ds3 = await createAndMockDataset('2024-10-30T10:05:00Z', context, testUserReg)
    const download3 = await doQuery(datasetDownloadLink, { datasetId: JSON.parse(ds3).datasetId }, { context: context })

    expect(JSON.parse(download1.downloadLinkJson)).not.toHaveProperty('message')
    expect(JSON.parse(download2.downloadLinkJson)).not.toHaveProperty('message')
    expect(JSON.parse(download3.downloadLinkJson)).toEqual(expect.objectContaining({
      message: expect.any(String),
    }))
  })

  it('should allow admins unlimited downloads of all datasets', async() => {
    const context = getContextForTest({ ...testUserReg }, testEntityManager)

    const ds1 = await doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: true }, { context })
    setMockDate('2024-10-30T10:01:00Z')
    const ds2 = await doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: true }, { context })
    setMockDate('2024-10-30T10:02:00Z')
    const ds3 = await doQuery(createDatasetQuery, { databaseIds: [database.id], isPublic: true }, { context })

    // Mock Elasticsearch response for each dataset
    mockElasticsearchResponse(JSON.parse(ds1).datasetId, testUserReg.id)
    mockElasticsearchResponse(JSON.parse(ds2).datasetId, testUserReg.id)
    mockElasticsearchResponse(JSON.parse(ds3).datasetId, testUserReg.id)

    const download1 = await doQuery(datasetDownloadLink, { datasetId: JSON.parse(ds1).datasetId }, { context: adminContext })
    const download2 = await doQuery(datasetDownloadLink, { datasetId: JSON.parse(ds2).datasetId }, { context: adminContext })
    const download3 = await doQuery(datasetDownloadLink, { datasetId: JSON.parse(ds3).datasetId }, { context: adminContext })

    expect(JSON.parse(download1.downloadLinkJson)).not.toHaveProperty('message')
    expect(JSON.parse(download2.downloadLinkJson)).not.toHaveProperty('message')
    expect(JSON.parse(download3.downloadLinkJson)).not.toHaveProperty('message')
  })
})
