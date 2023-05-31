// ElasticSearch must be mocked before importing any other graphql code. It uses doMock so that it can reference
// MockElasticSearchClient without jest's "jest.mock hoisting" causing problems.
class MockElasticSearchClient {
  static search = jest.fn()
  search = MockElasticSearchClient.search
}
jest.doMock('@elastic/elasticsearch', () => ({ Client: MockElasticSearchClient }))

import {
  createTestDataset, createTestDatasetDiagnostic,
  createTestGroup, createTestJob,
  createTestMolecularDB,
  createTestUserGroup,
} from '../../../tests/testDataCreation'
import {
  doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testEntityManager,
  testUser,
} from '../../../tests/graphqlTestEnvironment'
import { Group, UserGroupRoleOptions as UGRO } from '../../group/model'
import { Dataset } from '../model'
import { getContextForTest } from '../../../getContext'

describe('Dataset: diagnostics permissions', () => {
  let dataset: Dataset
  let group: Group

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()

    await setupTestUsers()
    dataset = await createTestDataset()
    group = await createTestGroup()
    const otherGroup = await createTestGroup()
    const databaseDocs = [
      { name: 'HMDB-v4', isPublic: true, groupId: null },
      { name: 'custom-db-pub', isPublic: true, groupId: group.id },
      { name: 'custom-db', isPublic: false, groupId: group.id },
      { name: 'custom-db-other-pub', isPublic: true, groupId: otherGroup.id },
      { name: 'custom-db-other-priv', isPublic: false, groupId: otherGroup.id },
    ]
    await createTestDatasetDiagnostic({ datasetId: dataset.id, data: { noJobId: true } })
    for (const dbDoc of databaseDocs) {
      const moldbId = (await createTestMolecularDB(dbDoc)).id
      const jobId = (await createTestJob({ datasetId: dataset.id, moldbId })).id
      await createTestDatasetDiagnostic({ datasetId: dataset.id, jobId })
    }

    // Mock elasticsearch so that it returns the minimum fields needed to reach the resolvers inside Dataset
    MockElasticSearchClient.search.mockImplementation(() =>
      ({ hits: { hits: [{ _source: { ds_id: dataset.id } }] } })
    )
  })
  afterEach(onAfterEach)

  const selectDatasetQuery = `query selectDataset($datasetId: String!) {
    dataset (id: $datasetId) {
      diagnostics {
        data jobId database { name }
      }
    }
  }`

  test("User only sees diagnostics for databases that they're allowed to see", async() => {
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)

    const context = getContextForTest({ ...testUser, groupIds: [group.id] } as any, testEntityManager)
    const ds = await doQuery(selectDatasetQuery, { datasetId: dataset.id }, { context })

    const noJobDiags = ds.diagnostics.filter((diag: any) => JSON.parse(diag.data).noJobId)
    const hasJobDiags = ds.diagnostics.filter((diag: any) => !JSON.parse(diag.data).noJobId)

    // Should see the diagnostic that isn't associated with any job/molDB
    expect(noJobDiags).toHaveLength(1)

    // Should only see molDBs that are visible
    const expectedMolDbs = ['HMDB-v4', 'custom-db-pub', 'custom-db', 'custom-db-other-pub']
    const unwantedMolDb = 'custom-db-other-priv'
    const foundMolDbs = hasJobDiags.map((diag: any) => diag.database.name)
    expect(foundMolDbs).toEqual(expect.arrayContaining(expectedMolDbs))
    expect(foundMolDbs).not.toContain(unwantedMolDb)
  })
})
