jest.mock('../../../../esConnector')
jest.mock('node-fetch')
import fetch from 'node-fetch'
import config from '../../../utils/config'

import {
  doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testEntityManager, testUser,
} from '../../../tests/graphqlTestEnvironment'
import { createTestProject } from '../../../tests/testDataCreation'
import { UserProject, UserProjectRoleOptions as UPRO } from '../../project/model'
import { Experiment } from '../model'

const mockFetch = fetch as jest.Mock

describe('Query.experimentIonIntensities', () => {
  let originalManagerApiUrl: string | undefined

  beforeAll(async() => {
    await onBeforeAll()
    originalManagerApiUrl = config.manager_api_url
    config.manager_api_url = 'https://test-api.metaspace.example'
  })

  afterAll(async() => {
    await onAfterAll()
    if (originalManagerApiUrl !== undefined) {
      config.manager_api_url = originalManagerApiUrl
    } else {
      delete (config as any).manager_api_url
    }
  })

  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockFetch.mockReset()
  })

  afterEach(onAfterEach)

  const seed = async() => {
    const p = await createTestProject({ name: 'P', isPublic: false })
    await testEntityManager.save(UserProject, {
      userId: testUser.id, projectId: p.id, role: UPRO.MEMBER,
    } as any)
    const exp: any = await testEntityManager.save(Experiment, {
      projectId: p.id,
      createdById: testUser.id,
      name: 'E',
      matchMode: 'name',
      runStatus: 'FINISHED',
      runStage: 'DONE',
      runGeneration: 1,
    } as any)
    return { p, exp }
  }

  it('proxies engine REST and maps snake_case to camelCase', async() => {
    const { exp } = await seed()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        rows: [
          { region_key: 'r1', intensity: 10, condition: 'control', sample_id: 'ds_1', biological_replicate_id: 'b1' },
          { regionKey: 'r2', intensity: 12, condition: 'treated', sampleId: 'ds_2' },
        ],
      }),
    })

    const rows = await doQuery<any[]>(
      `query($id: ID!, $ionId: Int!){
        experimentIonIntensities(experimentId: $id, ionId: $ionId) {
          regionKey intensity condition sampleId biologicalReplicateId
        }
      }`,
      { id: exp.id, ionId: 42 })

    expect(mockFetch).toHaveBeenCalledWith(
      `https://test-api.metaspace.example/v1/experiment/${exp.id}/ion/42/intensities`
    )
    expect(rows).toEqual([
      { regionKey: 'r1', intensity: 10, condition: 'control', sampleId: 'ds_1', biologicalReplicateId: 'b1' },
      { regionKey: 'r2', intensity: 12, condition: 'treated', sampleId: 'ds_2', biologicalReplicateId: null },
    ])
  })

  it('returns [] on engine 404', async() => {
    const { exp } = await seed()
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('not found') })
    const rows = await doQuery<any[]>(
      `query($id: ID!, $ionId: Int!){
        experimentIonIntensities(experimentId: $id, ionId: $ionId) { regionKey intensity }
      }`,
      { id: exp.id, ionId: 42 })
    expect(rows).toEqual([])
  })

  it('rejects non-members', async() => {
    const p = await createTestProject({ name: 'P', isPublic: false })
    const exp: any = await testEntityManager.save(Experiment, {
      projectId: p.id, createdById: testUser.id, name: 'E', matchMode: 'name',
    } as any)
    await expect(doQuery(
      `query($id: ID!, $ionId: Int!){
        experimentIonIntensities(experimentId: $id, ionId: $ionId) { regionKey }
      }`,
      { id: exp.id, ionId: 1 }))
      .rejects.toThrowError(/Not authorized|Access denied|Unauthorized/i)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
