// ElasticSearch must be mocked before importing any other graphql code.
class MockElasticSearchClient {
  static search = jest.fn()
  search = MockElasticSearchClient.search
}
jest.doMock('@elastic/elasticsearch', () => ({ Client: MockElasticSearchClient }))
jest.mock('node-fetch')

import fetch from 'node-fetch'
import {
  anonContext, doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach, setupTestUsers, testEntityManager,
  testUser,
} from '../../../tests/graphqlTestEnvironment'
import { createTestProject, createTestUserProject } from '../../../tests/testDataCreation'
import { UserProjectRoleOptions as UPRO } from '../../project/model'
import { getContextForTest } from '../../../getContext'
import config from '../../../utils/config'

const mockFetch = fetch as jest.Mock

const jsonResponse = (status: number, body: any = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: () => Promise.resolve(body),
})

const OWNER_ID = 'owner-user-id'
const DS_ID = 'ds-edit-access'

const sponsorship = (projectId: string, entitlements = ['private_resubmission']) => ({
  id: 'sp-' + projectId,
  projectId,
  proGroupId: 'pro-group',
  sponsorUserId: OWNER_ID,
  entitlements,
  isActive: true,
  createdAt: new Date().toISOString(),
})

const query = 'query ($id: String!) { dataset(id: $id) { canEdit editAccessMode } }'

describe('Dataset.editAccessMode', () => {
  let originalManagerApiUrl: string | undefined

  beforeAll(async() => {
    await onBeforeAll()
    originalManagerApiUrl = config.manager_api_url
    config.manager_api_url = 'https://test-api.metaspace.example'
  })
  afterAll(async() => {
    await onAfterAll()
    config.manager_api_url = originalManagerApiUrl as any
  })
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockFetch.mockReset()
    MockElasticSearchClient.search.mockReset()
  })
  afterEach(onAfterEach)

  const mockEs = (source: any) => {
    MockElasticSearchClient.search.mockImplementation(() => ({
      hits: { hits: [{ _source: { ds_id: DS_ID, ds_is_public: true, ds_project_ids: [], ...source } }] },
    }))
  }

  it('is FULL for the submitter, with canEdit true', async() => {
    mockEs({ ds_submitter_id: testUser.id })
    const context = getContextForTest(testUser as any, testEntityManager)

    const ds = await doQuery(query, { id: DS_ID }, { context })

    expect(ds).toEqual({ canEdit: true, editAccessMode: 'FULL' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('is SPONSORED for a project member when the sponsor owns the dataset, with canEdit false', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    mockEs({ ds_submitter_id: OWNER_ID, ds_project_ids: [project.id] })
    mockFetch.mockResolvedValue(jsonResponse(200, sponsorship(project.id)))
    const context = getContextForTest(testUser as any, testEntityManager)

    const ds = await doQuery(query, { id: DS_ID }, { context })

    expect(ds).toEqual({ canEdit: false, editAccessMode: 'SPONSORED' })
  })

  it('is null for a project member when the sponsorship lacks private_resubmission', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    mockEs({ ds_submitter_id: OWNER_ID, ds_project_ids: [project.id] })
    mockFetch.mockResolvedValue(jsonResponse(200, sponsorship(project.id, ['something_else'])))
    const context = getContextForTest(testUser as any, testEntityManager)

    const ds = await doQuery(query, { id: DS_ID }, { context })

    expect(ds).toEqual({ canEdit: false, editAccessMode: null })
  })

  it('is null for an anonymous caller and makes no manager call', async() => {
    const project = await createTestProject({ isPublic: false })
    mockEs({ ds_submitter_id: OWNER_ID, ds_project_ids: [project.id] })

    const ds = await doQuery(query, { id: DS_ID }, { context: anonContext })

    expect(ds).toEqual({ canEdit: false, editAccessMode: null })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
