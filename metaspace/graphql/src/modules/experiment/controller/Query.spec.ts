jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'

import {
  doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testEntityManager, testUser,
} from '../../../tests/graphqlTestEnvironment'
import {
  createTestProject, createTestJob, createTestMolecularDB, createTestDatasetWithEngineDataset,
} from '../../../tests/testDataCreation'
import { UserProject, UserProjectRoleOptions as UPRO } from '../../project/model'
import { Experiment, ExperimentDataset, ExperimentResult } from '../model'
import { Ion } from '../../annotation/model'
import { Annotation } from '../../engine/model'

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
        condA: 'control',
        condB: 'treated',
        lfc: 1.0,
        pValue: pv,
        fdr: 1.0,
        detectionRateA: 1,
        detectionRateB: 1,
        nA: 3,
        nB: 3,
        meanA: 1.0,
        meanB: 2.0,
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
        condA: 'control',
        condB: 'treated',
        lfc: 1.0,
        pValue: pv,
        fdr: 1.0,
        detectionRateA: 1,
        detectionRateB: 1,
        nA: 3,
        nB: 3,
        meanA: 1.0,
        meanB: 2.0,
      } as any)
    }
    const rows = await doQuery<any[]>(
      `query($id: ID!){ experimentResults(experimentId: $id, filter: { fdrMax: 0.1 })
        { pValue fdr } }`,
      { id: exp.id })
    expect(rows).toHaveLength(1)
    expect(rows[0].pValue).toBeCloseTo(0.001, 6)
  })

  it('experimentResults — lfcAbsMin keeps only rows with |lfc| >= threshold', async() => {
    const { exp } = await seed() as any
    const ion: any = await testEntityManager.save(Ion, {
      ion: 'C6H12O6+H+', formula: 'C6H12O6', adduct: '+H', ionFormula: 'C6H13O6', charge: 1,
    } as any)
    // lfc values spanning both signs; |lfc| >= 1 keeps 1.5, -1.5 and 2.0.
    for (const lfc of [0.2, -0.5, 1.5, -1.5, 2.0]) {
      await testEntityManager.save(ExperimentResult, {
        experimentId: exp.id,
        runGeneration: 1,
        ionId: ion.id,
        labelGroupName: 'tumor',
        condA: 'control',
        condB: 'treated',
        lfc,
        pValue: 0.01,
        fdr: 0.01,
        nA: 3,
        nB: 3,
        meanA: 1.0,
        meanB: 2.0,
        detectionRateA: 1,
        detectionRateB: 1,
      } as any)
    }
    const rows = await doQuery<any[]>(
      'query($id: ID!){ experimentResults(experimentId: $id, filter: { lfcAbsMin: 1 }, limit: 50) { lfc } }',
      { id: exp.id })
    const lfcs = rows.map(r => r.lfc).sort((a, b) => a - b)
    expect(lfcs).toEqual([-1.5, 1.5, 2.0])
  })

  it('experimentResults — database filter is scoped to the experiment\'s own datasets', async() => {
    // Regression: the ion-membership lookup used to scan annotation⨝job across
    // the ENTIRE platform for the selected moldb (WHERE j.moldb_id IN (...)),
    // which on production scanned hundreds of millions of rows and took minutes.
    // It must be scoped to this experiment's datasets, so an ion that belongs to
    // the same database only in an UNRELATED dataset does not leak in.
    const { exp } = await seed() as any
    const db = await createTestMolecularDB()

    // Two datasets sharing the same molecular DB: one inside the experiment, one outside.
    const { engineDataset: dsIn } = await createTestDatasetWithEngineDataset({ userId: testUser.id })
    const { engineDataset: dsOut } = await createTestDatasetWithEngineDataset({ userId: testUser.id })
    await testEntityManager.save(ExperimentDataset, {
      experimentId: exp.id, datasetId: dsIn.id, regionSource: 'whole', regions: [],
    } as any)

    const jobIn = await createTestJob({ datasetId: dsIn.id, moldbId: db.id })
    const jobOut = await createTestJob({ datasetId: dsOut.id, moldbId: db.id })
    const ionIn: any = await testEntityManager.save(Ion, {
      ion: 'In+H+', formula: 'C1H2', adduct: '+H', ionFormula: 'C1H3', charge: 1,
    } as any)
    const ionOut: any = await testEntityManager.save(Ion, {
      ion: 'Out+H+', formula: 'C2H2', adduct: '+H', ionFormula: 'C2H3', charge: 1,
    } as any)
    const annotation = (jobId: number, ionId: number, formula: string) =>
      testEntityManager.save(Annotation, {
        jobId,
        ionId,
        formula,
        chemMod: '',
        neutralLoss: '',
        adduct: '+H',
        msm: 0.9,
        fdr: 0.1,
        stats: {},
        isoImageIds: [],
      } as any)
    await annotation(jobIn.id, ionIn.id, 'C1H2')
    await annotation(jobOut.id, ionOut.id, 'C2H2')

    // Result rows exist for BOTH ions in the experiment.
    const result = (ionId: number, pValue: number) =>
      testEntityManager.save(ExperimentResult, {
        experimentId: exp.id,
        runGeneration: 1,
        ionId,
        labelGroupName: 'tumor',
        condA: 'control',
        condB: 'treated',
        lfc: 1.0,
        pValue,
        fdr: 1.0,
        nA: 3,
        nB: 3,
        meanA: 1.0,
        meanB: 2.0,
        detectionRateA: 1,
        detectionRateB: 1,
      } as any)
    await result(ionIn.id, 0.01)
    await result(ionOut.id, 0.02)

    const rows = await doQuery<any[]>(
      `query($id: ID!, $db: Int!){ experimentResults(
        experimentId: $id, filter: { databases: [$db] }, limit: 500
      ) { ion { id } pValue } }`,
      { id: exp.id, db: db.id })

    // Only the ion annotated under the DB *within this experiment's dataset*
    // survives. ionOut belongs to the same DB but only in an unrelated dataset.
    expect(rows).toHaveLength(1)
    expect(rows[0].ion.id).toBe(ionIn.id)
  })

  it('experimentResults — annotation resolves the representative ES annotation for the ion', async() => {
    const { exp } = await seed() as any
    const db = await createTestMolecularDB({ isPublic: true })
    const { engineDataset: ds } = await createTestDatasetWithEngineDataset({ userId: testUser.id })
    await testEntityManager.save(ExperimentDataset, {
      experimentId: exp.id, datasetId: ds.id, regionSource: 'whole', regions: [],
    } as any)
    const job = await createTestJob({ datasetId: ds.id, moldbId: db.id })
    const ion: any = await testEntityManager.save(Ion, {
      ion: 'C6H12O6+H+', formula: 'C6H12O6', adduct: '+H', ionFormula: 'C6H13O6', charge: 1,
    } as any)
    await testEntityManager.save(Annotation, {
      jobId: job.id,
      ionId: ion.id,
      formula: 'C6H12O6',
      chemMod: '',
      neutralLoss: '',
      adduct: '+H',
      msm: 0.9,
      fdr: 0.1,
      stats: {},
      isoImageIds: [],
    } as any)
    await testEntityManager.save(ExperimentResult, {
      experimentId: exp.id,
      runGeneration: 1,
      ionId: ion.id,
      labelGroupName: 'tumor',
      condA: 'control',
      condB: 'treated',
      lfc: 1.0,
      pValue: 0.01,
      fdr: 0.05,
      nA: 3,
      nB: 3,
      meanA: 1.0,
      meanB: 2.0,
      detectionRateA: 1,
      detectionRateB: 1,
    } as any)
    // The row resolver finds the representative (ds, db) from the DB above, then
    // hands the ion string + ds + db to esAnnotationByIon (ES is mocked here).
    // The raw hit must be run through unpackAnnotation so the Annotation type's
    // non-null scalar fields (id/ion/sumFormula/fdrLevel) are populated.
    mockEs.esAnnotationByIon.mockResolvedValue({
      _id: 'ann1',
      _source: {
        db_id: db.id,
        ds_id: ds.id,
        formula: 'C6H12O6',
        ion: 'C6H12O6+H+',
        adduct: '+H',
        ion_formula: 'C6H13O6',
        chem_mod: '',
        neutral_loss: '',
        centroid_mzs: [181.07],
        mz: 181.07,
        fdr: 0.1,
        msm: 0.9,
        is_mono: true,
      },
    } as any)

    const rows = await doQuery<any[]>(
      `query($id: ID!){ experimentResults(experimentId: $id, limit: 10) {
        ion { id }
        annotation { id ion sumFormula fdrLevel databaseDetails { id name } }
      } }`,
      { id: exp.id })

    expect(rows).toHaveLength(1)
    expect(rows[0].annotation).not.toBeNull()
    expect(rows[0].annotation.id).toBe('ann1')
    expect(rows[0].annotation.ion).toBe('C6H12O6+H+')
    expect(rows[0].annotation.sumFormula).toBe('C6H12O6')
    expect(rows[0].annotation.fdrLevel).toBeCloseTo(0.1, 6)
    expect(rows[0].annotation.databaseDetails.name).toBe('test-db')
    expect(mockEs.esAnnotationByIon).toHaveBeenCalledWith('C6H12O6+H+', ds.id, String(db.id), expect.anything())
  })

  it('experimentResults — annotation is null when the ion has no annotation in the experiment', async() => {
    const { exp } = await seed() as any
    const ion: any = await testEntityManager.save(Ion, {
      ion: 'C6H12O6+H+', formula: 'C6H12O6', adduct: '+H', ionFormula: 'C6H13O6', charge: 1,
    } as any)
    await testEntityManager.save(ExperimentResult, {
      experimentId: exp.id,
      runGeneration: 1,
      ionId: ion.id,
      labelGroupName: 'tumor',
      condA: 'control',
      condB: 'treated',
      lfc: 1.0,
      pValue: 0.01,
      fdr: 0.05,
      nA: 3,
      nB: 3,
      meanA: 1.0,
      meanB: 2.0,
      detectionRateA: 1,
      detectionRateB: 1,
    } as any)
    mockEs.esAnnotationByIon.mockResolvedValue({ _id: 'x', _source: {} } as any)

    const rows = await doQuery<any[]>(
      `query($id: ID!){ experimentResults(experimentId: $id, limit: 10) {
        ion { id }
        annotation { databaseDetails { id } }
      } }`,
      { id: exp.id })

    expect(rows).toHaveLength(1)
    // No engine annotation/job for this ion in the experiment → no representative
    // → null (and ES is never consulted).
    expect(rows[0].annotation).toBeNull()
    expect(mockEs.esAnnotationByIon).not.toHaveBeenCalled()
  })
})

describe('experimentResults contrast filter', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
  })
  afterEach(onAfterEach)

  const PAIRS: Array<[string, string]> = [
    ['control', 'timepoint_3'],
    ['control', 'treated'],
    ['timepoint_3', 'treated'],
  ]

  const seedK3 = async() => {
    const p = await createTestProject({ name: 'PK3', isPublic: false })
    await testEntityManager.save(UserProject, {
      userId: testUser.id, projectId: p.id, role: UPRO.MEMBER,
    } as any)
    const exp: any = await testEntityManager.save(Experiment, {
      projectId: p.id,
      createdById: testUser.id,
      name: 'EK3',
      matchMode: 'name',
      runStatus: 'FINISHED',
      runStage: 'DONE',
      runGeneration: 1,
    } as any)
    // 5 distinct ions to exercise per-scope BH.
    const ions: any[] = []
    for (let i = 0; i < 5; i++) {
      const ion: any = await testEntityManager.save(Ion, {
        ion: `Ion${i}+H+`,
        formula: `C${i + 1}H2`,
        adduct: '+H',
        ionFormula: `C${i + 1}H3`,
        charge: 1,
      } as any)
      ions.push(ion)
    }
    // Omnibus rows (cond_a/cond_b/lfc/etc NULL).
    for (let i = 0; i < ions.length; i++) {
      await testEntityManager.save(ExperimentResult, {
        experimentId: exp.id,
        runGeneration: 1,
        ionId: ions[i].id,
        labelGroupName: 'tumor',
        condA: null,
        condB: null,
        lfc: null,
        pValue: 0.01 * (i + 1),
        fdr: 1.0,
        nA: null,
        nB: null,
        meanA: null,
        meanB: null,
        detectionRateA: null,
        detectionRateB: null,
      } as any)
    }
    // Pair rows for each of the 3 contrasts (lex-canonicalized).
    for (const [ca, cb] of PAIRS) {
      for (let i = 0; i < ions.length; i++) {
        await testEntityManager.save(ExperimentResult, {
          experimentId: exp.id,
          runGeneration: 1,
          ionId: ions[i].id,
          labelGroupName: 'tumor',
          condA: ca,
          condB: cb,
          lfc: 1.0,
          pValue: 0.02 * (i + 1),
          fdr: 1.0,
          nA: 3,
          nB: 3,
          meanA: 1.0,
          meanB: 2.0,
          detectionRateA: 1,
          detectionRateB: 1,
        } as any)
      }
    }
    return { p, exp, ions }
  }

  it('returns only omnibus rows when filter.contrast.omnibus = true', async() => {
    const { exp } = await seedK3() as any
    const rows = await doQuery<any[]>(
      `query($id: ID!){ experimentResults(
        experimentId: $id, filter: { contrast: { omnibus: true } }, limit: 500
      ) { pValue fdr condA condB } }`,
      { id: exp.id })
    expect(rows.length).toBe(5)
    rows.forEach(r => {
      expect(r.condA).toBeNull()
      expect(r.condB).toBeNull()
    })
  })

  it('returns only the specified pair (canonicalized) when condA/condB given', async() => {
    const { exp } = await seedK3() as any
    // Pass in non-canonical (reversed) order; resolver must canonicalize.
    const rows = await doQuery<any[]>(
      `query($id: ID!){ experimentResults(
        experimentId: $id,
        filter: { contrast: { condA: "treated", condB: "control" } },
        limit: 500
      ) { condA condB } }`,
      { id: exp.id })
    expect(rows.length).toBe(5)
    rows.forEach(r => {
      expect(r.condA).toBe('control')
      expect(r.condB).toBe('treated')
    })
  })

  it('defaults to pair rows when no contrast given', async() => {
    const { exp } = await seedK3() as any
    const rows = await doQuery<any[]>(
      `query($id: ID!){ experimentResults(
        experimentId: $id, limit: 500
      ) { condA condB } }`,
      { id: exp.id })
    // 3 pairs * 5 ions = 15
    expect(rows.length).toBe(15)
    rows.forEach(r => expect(r.condA).not.toBeNull())
  })

  it('BH recomputation is scoped per contrast', async() => {
    const { exp } = await seedK3() as any
    // Omnibus scope has 5 rows; a single-pair scope has 5 rows too. Choose
    // the same p_value in each scope and check post-resolver fdr differs
    // due to BH scope size differing only when adduct filter narrows one.
    // Here we instead rely on the fact that omnibus p-values start at 0.01
    // while pair p-values start at 0.02 — BH adjusted fdrs must differ.
    const omn = await doQuery<any[]>(
      `query($id: ID!){ experimentResults(
        experimentId: $id, filter: { contrast: { omnibus: true } }, limit: 500
      ) { pValue fdr } }`,
      { id: exp.id })
    const pair = await doQuery<any[]>(
      `query($id: ID!){ experimentResults(
        experimentId: $id,
        filter: { contrast: { condA: "control", condB: "treated" } },
        limit: 500
      ) { pValue fdr } }`,
      { id: exp.id })
    expect(omn.length).toBe(5)
    expect(pair.length).toBe(5)
    // Each scope independently BH-corrected. Min adjusted p in each scope
    // should reflect its own n=5 and min raw p (0.01 vs 0.02).
    const omnMin = Math.min(...omn.map(r => r.fdr))
    const pairMin = Math.min(...pair.map(r => r.fdr))
    expect(omnMin).toBeCloseTo(0.05, 5)
    expect(pairMin).toBeCloseTo(0.10, 5)
    expect(omnMin).not.toBeCloseTo(pairMin, 5)
  })
})
