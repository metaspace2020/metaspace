jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'

import * as _smApiDatasets from '../../../utils/smApi/datasets'
jest.mock('../../../utils/smApi/datasets')

import {
  doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testEntityManager, testUser,
} from '../../../tests/graphqlTestEnvironment'
import { createTestDataset, createTestProject } from '../../../tests/testDataCreation'
import { UserProject, UserProjectRoleOptions as UPRO } from '../../project/model'
import { Experiment, ExperimentDataset } from '../model'

const mockEs = _mockEsConnector as jest.Mocked<typeof _mockEsConnector>
const mockSm = _smApiDatasets as jest.Mocked<typeof _smApiDatasets>

const makeProjectWithMember = async(role = UPRO.MEMBER) => {
  const p = await createTestProject({ name: 'Test', isPublic: false })
  await testEntityManager.save(UserProject, { userId: testUser.id, projectId: p.id, role } as any)
  return p
}

const setEsPolarity = (byId: Record<string, '+' | '-'>) => {
  mockEs.esDatasetByID.mockImplementation((id: string) =>
    Promise.resolve({ _source: { ds_id: id, ds_submitter_id: testUser.id, ds_polarity: byId[id] } } as any))
}

const createMutation = `
  mutation($projectId: ID!, $input: ExperimentInput!) {
    createExperiment(projectId: $projectId, input: $input) {
      id name datasets { dataset { id } regions { regionKey sourceKind labelGroupName metadata { condition sampleId } } }
      labelGroups { name color }
    }
  }`

const buildInput = (datasetIds: string[]) => ({
  name: 'Mice',
  description: null,
  matchMode: 'NAME',
  datasets: datasetIds.map((id, i) => ({
    datasetId: id,
    regionSource: 'WHOLE',
    regions: [{
      regionKey: `${id}:whole`,
      sourceKind: 'whole',
      roiId: null,
      segmentationId: null,
      labelGroupName: 'tumor',
      metadata: {
        condition: i % 2 === 0 ? 'control' : 'treated',
        biologicalReplicateId: `mouse${i}`,
        sampleId: `s${i}`,
        technicalReplicateId: null,
        batchId: null,
      },
    }],
  })),
  labelGroups: [{ name: 'tumor', color: '#ff0000' }],
})

describe('createExperiment', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockSm.smApiDatasetRequest.mockResolvedValue({} as any)
  })
  afterEach(async() => {
    await onAfterEach()
    jest.clearAllMocks()
  })

  it('rejects non-member', async() => {
    const p = await createTestProject({ name: 'P', isPublic: false })
    const ds = await createTestDataset()
    setEsPolarity({ [ds.id]: '+' })
    await expect(doQuery(createMutation, { projectId: p.id, input: buildInput([ds.id]) }))
      .rejects.toThrowError(/Not authorized/)
  })

  it('rejects mismatched polarity', async() => {
    const p = await makeProjectWithMember()
    const ds1 = await createTestDataset()
    const ds2 = await createTestDataset()
    setEsPolarity({ [ds1.id]: '+', [ds2.id]: '-' })
    await expect(doQuery(createMutation, { projectId: p.id, input: buildInput([ds1.id, ds2.id]) }))
      .rejects.toThrowError(/polarity/i)
  })

  it('persists rows on happy path', async() => {
    const p = await makeProjectWithMember()
    const ds1 = await createTestDataset()
    const ds2 = await createTestDataset()
    setEsPolarity({ [ds1.id]: '+', [ds2.id]: '+' })
    const r = await doQuery<any>(createMutation,
      { projectId: p.id, input: buildInput([ds1.id, ds2.id]) })
    expect(r.datasets).toHaveLength(2)
    const exps = await testEntityManager.find(Experiment)
    expect(exps).toHaveLength(1)
    expect(exps[0].labelGroups).toEqual([{ name: 'tumor', color: '#ff0000' }])
    const eds = await testEntityManager.find(ExperimentDataset)
    expect(eds).toHaveLength(2)
    expect(eds[0].regions).toHaveLength(1)
    expect(eds[0].regions[0].labelGroupName).toBe('tumor')
  })
})

const updateMutation = `
  mutation($id: ID!, $input: ExperimentInput!) {
    updateExperiment(id: $id, input: $input) { id name datasets { dataset { id } } labelGroups { name } }
  }`
const deleteMutation = 'mutation($id: ID!) { deleteExperiment(id: $id) }'

describe('updateExperiment', () => {
  beforeAll(onBeforeAll); afterAll(onAfterAll)
  beforeEach(async() => { await onBeforeEach(); await setupTestUsers(); mockSm.smApiDatasetRequest.mockResolvedValue({} as any) })
  afterEach(async() => { await onAfterEach(); jest.clearAllMocks() })

  it('replaces datasets and label groups atomically', async() => {
    const p = await makeProjectWithMember()
    const ds1 = await createTestDataset(); const ds2 = await createTestDataset(); const ds3 = await createTestDataset()
    setEsPolarity({ [ds1.id]: '+', [ds2.id]: '+', [ds3.id]: '+' })
    const created = await doQuery<any>(createMutation, { projectId: (p as any).id, input: buildInput([ds1.id, ds2.id]) })
    const newInput = { ...buildInput([ds3.id]), labelGroups: [{ name: 'stroma', color: '#00ff00' }] }
    newInput.datasets[0].regions[0].labelGroupName = 'stroma'
    await doQuery(updateMutation, { id: created.id, input: newInput })

    const eds = await testEntityManager.find(ExperimentDataset, { where: { experimentId: created.id } })
    expect(eds.map(e => e.datasetId)).toEqual([ds3.id])
    const exp = await testEntityManager.findOneOrFail(Experiment, created.id)
    expect(exp.labelGroups.map((l: any) => l.name)).toEqual(['stroma'])
  })
})

describe('deleteExperiment', () => {
  beforeAll(onBeforeAll); afterAll(onAfterAll)
  beforeEach(async() => { await onBeforeEach(); await setupTestUsers(); mockSm.smApiDatasetRequest.mockResolvedValue({} as any) })
  afterEach(async() => { await onAfterEach(); jest.clearAllMocks() })

  it('cascades to children', async() => {
    const p = await makeProjectWithMember()
    const ds = await createTestDataset(); setEsPolarity({ [ds.id]: '+' })
    const created = await doQuery<any>(createMutation, { projectId: (p as any).id, input: buildInput([ds.id]) })
    expect(await doQuery(deleteMutation, { id: created.id })).toBe(true)
    expect(await testEntityManager.find(Experiment)).toHaveLength(0)
    expect(await testEntityManager.find(ExperimentDataset)).toHaveLength(0)
  })
})

const runMutation = 'mutation($id: ID!) { runExperiment(id: $id) { id run { status stage generation } } }'
const updExclMutation = `mutation($experimentId: ID!, $excludedSamples: [String!]!) {
  updateExperimentExcludedSamples(experimentId: $experimentId, excludedSamples: $excludedSamples) {
    id run { status generation excludedSamples }
  } }`

describe('runExperiment', () => {
  beforeAll(onBeforeAll); afterAll(onAfterAll)
  beforeEach(async() => { await onBeforeEach(); await setupTestUsers(); mockSm.smApiDatasetRequest.mockResolvedValue({} as any) })
  afterEach(async() => { await onAfterEach(); jest.clearAllMocks() })

  const seed = async() => {
    const p = await makeProjectWithMember()
    const ds = await createTestDataset(); setEsPolarity({ [ds.id]: '+' })
    return await doQuery<any>(createMutation, { projectId: (p as any).id, input: buildInput([ds.id]) })
  }

  it('queues run and POSTs to engine', async() => {
    const exp = await seed()
    const r = await doQuery<any>(runMutation, { id: exp.id })
    expect(r.run.status).toBe('QUEUED')
    expect(r.run.generation).toBe(1)
    expect(mockSm.smApiDatasetRequest).toHaveBeenCalledWith(
      '/v1/experiment/run', expect.objectContaining({ experiment_id: exp.id, run_generation: 1 }))
  })

  it('increments generation on re-run', async() => {
    const exp = await seed()
    await doQuery<any>(runMutation, { id: exp.id })
    const second = await doQuery<any>(runMutation, { id: exp.id })
    expect(second.run.generation).toBe(2)
  })

  it('updateExperimentExcludedSamples persists and triggers run', async() => {
    const exp = await seed()
    await testEntityManager.update(Experiment, exp.id, {
      runStatus: 'FINISHED', runStage: 'DONE', runGeneration: 1,
    } as any)
    mockSm.smApiDatasetRequest.mockClear()
    const r = await doQuery<any>(updExclMutation, { experimentId: exp.id, excludedSamples: ['s0', 's3'] })
    expect(r.run.excludedSamples).toEqual(['s0', 's3'])
    expect(r.run.status).toBe('QUEUED')
    expect(r.run.generation).toBe(2)
    expect(mockSm.smApiDatasetRequest).toHaveBeenCalledWith(
      '/v1/experiment/run', expect.objectContaining({ experiment_id: exp.id, run_generation: 2 }))
  })
})
