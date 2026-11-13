import * as _smApiDatasets from '../../../utils/smApi/datasets'
jest.mock('../../../utils/smApi/datasets')

jest.mock('../../plan/util/canPerformAction')
import * as _planActions from '../../plan/util/canPerformAction'

jest.mock('../../plan/util/betaTesterApi')
import * as _betaTesterApi from '../../plan/util/betaTesterApi'

jest.mock('node-fetch')
import fetch from 'node-fetch'

import config from '../../../utils/config'
import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser,
} from '../../../tests/graphqlTestEnvironment'
import {
  createTestDatasetProject,
  createTestDatasetWithEngineDataset,
  createTestGroup,
  createTestMolecularDB,
  createTestProject,
  createTestUser,
  createTestUserProject,
} from '../../../tests/testDataCreation'
import { Project, UserProjectRoleOptions as UPRO } from '../../project/model'
import { User } from '../../user/model'
import { Group } from '../../group/model'
import { Dataset } from '../model'
import { EngineDataset } from '../../engine/model'

const mockSmApiDatasets = _smApiDatasets as jest.Mocked<typeof _smApiDatasets>
const mockPlanActions = _planActions as jest.Mocked<typeof _planActions>
const mockBetaTesterApi = _betaTesterApi as jest.Mocked<typeof _betaTesterApi>
const mockFetch = fetch as unknown as jest.Mock

const LOCK_MESSAGE = 'Only the dataset owner can change its group, projects, principal investigator or visibility'

const jsonResponse = (status: number, body: any = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: () => Promise.resolve(body),
})

const sponsorship = (projectId: string, sponsorUserId: string, entitlements = ['private_resubmission']) => ({
  id: 'sp-' + projectId,
  projectId,
  proGroupId: 'pro-group',
  sponsorUserId,
  entitlements,
  isActive: true,
  createdAt: new Date().toISOString(),
})

const respondByProject = (byProject: Record<string, any>) => {
  mockFetch.mockImplementation((url: string) => {
    const id = Object.keys(byProject).find(p => url.endsWith(`/api/project-sponsorships/project/${p}`))
    return Promise.resolve(id != null ? byProject[id] : jsonResponse(404))
  })
}

const updateDatasetQuery = `mutation($datasetId: String!, $input: DatasetUpdateInput!, $reprocess: Boolean) {
  updateDataset(id: $datasetId, input: $input, reprocess: $reprocess)
}`
const deleteDatasetQuery = `mutation($datasetId: String!) {
  deleteDataset(id: $datasetId)
}`

describe('updateDataset: sponsored edit access', () => {
  let originalManagerApiUrl: string | undefined
  let OWNER: User
  let G: Group
  let P: Project
  let dataset: Dataset
  let engineDataset: EngineDataset

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
    mockSmApiDatasets.smApiDatasetRequest.mockResolvedValue({ status: 'ok' } as any)
    mockSmApiDatasets.smApiUpdateDataset.mockResolvedValue({ status: 'ok' } as any)
    mockSmApiDatasets.smApiDeleteDataset.mockResolvedValue({ status: 'ok' } as any)
    mockBetaTesterApi.hasBetaFeature.mockResolvedValue(false)

    OWNER = await createTestUser({ name: 'owner' })
    G = await createTestGroup()
    P = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, P.id, UPRO.MEMBER)
    ;({ dataset, engineDataset } = await createTestDatasetWithEngineDataset(
      { userId: OWNER.id, groupId: G.id, piName: 'Original PI', piEmail: 'pi@example.com' },
    ))
  })
  afterEach(async() => {
    await onAfterEach()
    jest.clearAllMocks()
  })

  const qualify = () => respondByProject({ [P.id]: jsonResponse(200, sponsorship(P.id, OWNER.id)) })
  const expectUnchanged = async() => {
    expect(mockSmApiDatasets.smApiUpdateDataset).not.toHaveBeenCalled()
    expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
    const stored = await testEntityManager.findOneOrFail(Dataset, dataset.id)
    expect(stored.groupId).toBe(G.id)
    expect(stored.piName).toBe('Original PI')
  }

  it('lets a sponsored member change metadata and databases, and sends projectIds on the action', async() => {
    await createTestDatasetProject(P.id, dataset.id)
    qualify()
    const moldb = await createTestMolecularDB({ isPublic: true })
    const metadata = { ...engineDataset.metadata, Additional_Information: { Supplementary: 'edited' } }

    await expect(doQuery(updateDatasetQuery, {
      datasetId: dataset.id,
      input: { metadataJson: JSON.stringify(metadata), databaseIds: [moldb.id] },
      reprocess: true,
    })).resolves.toBeTruthy()

    expect(mockSmApiDatasets.smApiDatasetRequest).toHaveBeenCalledWith(
      `/v1/datasets/${dataset.id}/add`,
      expect.objectContaining({ doc: expect.objectContaining({ id: dataset.id, databaseIds: [moldb.id] }) }),
    )
    expect(mockPlanActions.assertCanPerformAction).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ projectIds: [P.id] }))
    const stored = await testEntityManager.findOneOrFail(Dataset, dataset.id)
    expect(stored.userId).toBe(OWNER.id)
  })

  it('lets a sponsored member make a plain metadata update through smApiUpdateDataset', async() => {
    await createTestDatasetProject(P.id, dataset.id)
    qualify()

    await expect(doQuery(updateDatasetQuery, { datasetId: dataset.id, input: { name: 'renamed' } }))
      .resolves.toBeTruthy()

    expect(mockSmApiDatasets.smApiUpdateDataset).toHaveBeenCalledWith(
      dataset.id, expect.objectContaining({ name: 'renamed' }), expect.anything())
  })

  it('denies a member when the sponsorship lacks private_resubmission', async() => {
    await createTestDatasetProject(P.id, dataset.id)
    respondByProject({ [P.id]: jsonResponse(200, sponsorship(P.id, OWNER.id, ['other_entitlement'])) })

    await expect(doQuery(updateDatasetQuery, { datasetId: dataset.id, input: { name: 'renamed' } }))
      .rejects.toThrow('Access denied')
    await expectUnchanged()
  })

  it('denies a member when the sponsor does not own the dataset', async() => {
    await createTestDatasetProject(P.id, dataset.id)
    const someoneElse = await createTestUser({ name: 'other sponsor' })
    respondByProject({ [P.id]: jsonResponse(200, sponsorship(P.id, someoneElse.id)) })

    await expect(doQuery(updateDatasetQuery, { datasetId: dataset.id, input: { name: 'renamed' } }))
      .rejects.toThrow('Access denied')
    await expectUnchanged()
  })

  it('denies when the dataset_project link is not approved', async() => {
    await createTestDatasetProject(P.id, dataset.id, false)
    qualify()

    await expect(doQuery(updateDatasetQuery, { datasetId: dataset.id, input: { name: 'renamed' } }))
      .rejects.toThrow('Access denied')
    await expectUnchanged()
  })

  it('denies when the manager is unreachable', async() => {
    await createTestDatasetProject(P.id, dataset.id)
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(doQuery(updateDatasetQuery, { datasetId: dataset.id, input: { name: 'renamed' } }))
      .rejects.toThrow('Access denied')
    await expectUnchanged()
  })

  it.each(['groupId', 'projectIds', 'isPublic', 'principalInvestigator'])(
    'refuses a sponsored update that changes %s', async(field) => {
      await createTestDatasetProject(P.id, dataset.id)
      qualify()
      const otherGroup = await createTestGroup({ name: 'other group', shortName: 'othgrp' })
      const otherProject = await createTestProject({ name: 'other project', isPublic: false })
      const changes: Record<string, any> = {
        groupId: otherGroup.id,
        projectIds: [P.id, otherProject.id],
        isPublic: !engineDataset.isPublic,
        principalInvestigator: { name: 'Someone', email: 'x@y.z' },
      }

      await expect(doQuery(updateDatasetQuery, {
        datasetId: dataset.id, input: { name: 'renamed', [field]: changes[field] },
      })).rejects.toThrow(LOCK_MESSAGE)
      await expectUnchanged()
      expect(mockPlanActions.assertCanPerformAction).not.toHaveBeenCalled()
    })

  it('accepts a sponsored update whose projectIds equal the current set in another order', async() => {
    const P2 = await createTestProject({ name: 'second', isPublic: false })
    await createTestDatasetProject(P.id, dataset.id)
    await createTestDatasetProject(P2.id, dataset.id)
    qualify()

    await expect(doQuery(updateDatasetQuery, {
      datasetId: dataset.id, input: { projectIds: [P2.id, P.id], name: 'renamed' },
    })).resolves.toBeTruthy()
    expect(mockSmApiDatasets.smApiUpdateDataset).toHaveBeenCalledWith(
      dataset.id, expect.objectContaining({ name: 'renamed' }), expect.anything())
  })

  it('accepts a sponsored update that resends the unchanged group, visibility and principal investigator',
    async() => {
      await createTestDatasetProject(P.id, dataset.id)
      qualify()

      await expect(doQuery(updateDatasetQuery, {
        datasetId: dataset.id,
        input: {
          name: 'renamed',
          groupId: G.id,
          isPublic: engineDataset.isPublic,
          principalInvestigator: { name: 'Original PI', email: 'pi@example.com' },
        },
      })).resolves.toBeTruthy()
      expect(mockSmApiDatasets.smApiUpdateDataset).toHaveBeenCalled()
    })

  it('keeps deleteDataset denied for the sponsored member', async() => {
    await createTestDatasetProject(P.id, dataset.id)
    qualify()

    await expect(doQuery(deleteDatasetQuery, { datasetId: dataset.id })).rejects.toThrow('Access denied')
    expect(mockSmApiDatasets.smApiDeleteDataset).not.toHaveBeenCalled()
    expect(await testEntityManager.findOne(Dataset, dataset.id)).toBeDefined()
  })

  it('still lets the submitter change groupId (non-sponsored path unchanged)', async() => {
    const { dataset: ownDataset } = await createTestDatasetWithEngineDataset({ userId: testUser.id, groupId: G.id })
    const otherGroup = await createTestGroup({ name: 'other group', shortName: 'othgrp' })

    await expect(doQuery(updateDatasetQuery, { datasetId: ownDataset.id, input: { groupId: otherGroup.id } }))
      .resolves.toBeTruthy()

    const stored = await testEntityManager.findOneOrFail(Dataset, ownDataset.id)
    expect(stored.groupId).toBe(otherGroup.id)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
