jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'

import {
  doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testEntityManager, testUser,
} from '../../../tests/graphqlTestEnvironment'
import { createTestProject } from '../../../tests/testDataCreation'
import { UserProject, UserProjectRoleOptions as UPRO } from '../../project/model'
import { Experiment, ExperimentResult } from '../model'
import { Ion } from '../../annotation/model'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockEs = _mockEsConnector as jest.Mocked<typeof _mockEsConnector>

describe('experiment queries', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
  })
  afterEach(onAfterEach)

  const seed = async() => {
    const p = await createTestProject({ name: 'P', isPublic: false })
    await testEntityManager.save(UserProject, { userId: testUser.id, projectId: p.id, role: UPRO.MEMBER } as any)
    const exp = await testEntityManager.save(Experiment, {
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

  it('experiment(id) — non-member rejected', async() => {
    const p = await createTestProject({ name: 'P', isPublic: false })
    const exp: any = await testEntityManager.save(Experiment, {
      projectId: p.id, createdById: testUser.id, name: 'E', matchMode: 'name',
    } as any)
    await expect(doQuery(`{ experiment(id: "${exp.id}") { id } }`, {}))
      .rejects.toThrowError(/Not authorized|Access denied|Unauthorized/i)
  })

  it('experimentsByProject — returns project members\' experiments', async() => {
    const { p, exp } = await seed() as any
    const r = await doQuery<any>(
      'query($pid: ID!){ experimentsByProject(projectId: $pid) { id name } }',
      { pid: p.id })
    expect(r).toEqual([{ id: exp.id, name: 'E' }])
  })

  it('experimentRunQc — returns run_qc blob', async() => {
    const { exp } = await seed() as any
    const qc = { totalIons: 42, ok: true }
    await testEntityManager.update(Experiment, exp.id, { runQc: qc } as any)
    const r = await doQuery<any>(
      'query($id: ID!){ experimentRunQc(experimentId: $id) }',
      { id: exp.id })
    expect(r).toEqual(qc)
  })

  it('experimentResults — BH recompute and fdrMax cap', async() => {
    const { exp } = await seed() as any
    // Create an Ion to satisfy FK (one row, reused for all results).
    const ion: any = await testEntityManager.save(Ion, {
      ion: 'C6H12O6+H+',
      formula: 'C6H12O6',
      adduct: '+H',
      ionFormula: 'C6H13O6',
      charge: 1,
    } as any)
    const pValues = [0.01, 0.02, 0.03, 0.04, 0.05]
    for (const pv of pValues) {
      await testEntityManager.save(ExperimentResult, {
        experimentId: exp.id,
        runGeneration: 1,
        ionId: ion.id,
        labelGroupName: 'tumor',
        lfc: 1.0,
        pValue: pv,
        fdr: 1.0,
        detectionRateA: 1,
        detectionRateB: 1,
        nA: 3,
        nB: 3,
      } as any)
    }
    const rows = await doQuery<any[]>(
      `query($id: ID!){ experimentResults(experimentId: $id, filter: { fdrMax: 0.5 })
        { pValue fdr } }`,
      { id: exp.id })
    // BH: adj_i = min(prev, p * n / rank). With p sorted asc & n=5:
    //  rank 5: 0.05 * 5/5 = 0.05
    //  rank 4: min(0.05, 0.04*5/4=0.05) = 0.05
    //  rank 3: min(0.05, 0.03*5/3=0.05) = 0.05
    //  rank 2: min(0.05, 0.02*5/2=0.05) = 0.05
    //  rank 1: min(0.05, 0.01*5/1=0.05) = 0.05
    expect(rows).toHaveLength(5)
    rows.forEach(r => expect(r.fdr).toBeCloseTo(0.05, 5))
  })

  it('experimentResults — fdrMax drops rows above the cap', async() => {
    const { exp } = await seed() as any
    const ion: any = await testEntityManager.save(Ion, {
      ion: 'C6H12O6+H+',
      formula: 'C6H12O6',
      adduct: '+H',
      ionFormula: 'C6H13O6',
      charge: 1,
    } as any)
    // Two rows: p=0.5 (BH adj=0.5), p=0.001 (BH adj=0.001).
    for (const pv of [0.5, 0.001]) {
      await testEntityManager.save(ExperimentResult, {
        experimentId: exp.id,
        runGeneration: 1,
        ionId: ion.id,
        labelGroupName: 'tumor',
        lfc: 1.0,
        pValue: pv,
        fdr: 1.0,
        detectionRateA: 1,
        detectionRateB: 1,
        nA: 3,
        nB: 3,
      } as any)
    }
    const rows = await doQuery<any[]>(
      `query($id: ID!){ experimentResults(experimentId: $id, filter: { fdrMax: 0.1 })
        { pValue fdr } }`,
      { id: exp.id })
    expect(rows).toHaveLength(1)
    expect(rows[0].pValue).toBeCloseTo(0.001, 6)
  })
})
