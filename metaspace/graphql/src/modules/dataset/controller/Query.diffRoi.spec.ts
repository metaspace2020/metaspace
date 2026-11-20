jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'

import {
  adminUser,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser,
} from '../../../tests/graphqlTestEnvironment'
import { createTestDataset, createTestMolecularDB } from '../../../tests/testDataCreation'
import { Annotation, DiffRoi, Job, Roi } from '../../engine/model'

const mockEsConnector = _mockEsConnector as jest.Mocked<typeof _mockEsConnector>

const diffRoiResultsQuery = `query($datasetId: String!, $filter: DiffRoiFilter) {
    diffRoiResults(datasetId: $datasetId, filter: $filter) {
      roi { id name geojson }
      lfc auc groupLabel referenceLabel roiIds nRois nConcordant
      annotation { id }
    }
  }`

describe('Dataset queries: diffRoiResults', () => {
  let datasetId: string
  let tumor1: Roi, tumor2: Roi, square: Roi, stroma: Roi
  let annotationIds: number[]

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockEsConnector.esDatasetByID.mockImplementation(async(id) =>
      Promise.resolve({ _source: { ds_id: id, ds_submitter_id: testUser.id } } as any)
    )

    datasetId = (await createTestDataset()).id
    const moldb = await createTestMolecularDB()
    const job = await testEntityManager.save(Job, { moldbId: moldb.id, datasetId, status: 'FINISHED' } as any) as Job
    annotationIds = []
    for (const formula of ['C6H12O6', 'C5H10O5']) {
      const annotation = await testEntityManager.save(Annotation, {
        jobId: job.id, formula, chemMod: '', neutralLoss: '', adduct: '+H', msm: 0.9, fdr: 0.1, stats: {}, isoImageIds: [],
      } as any) as Annotation
      annotationIds.push(annotation.id)
    }
    mockEsConnector.esSearchResults.mockResolvedValue(
      annotationIds.map(id => ({ _id: `${datasetId}_${id}`, _source: { centroid_mzs: [100] } })) as any
    )

    const saveRoi = (name: string, groupLabel: string | null) => testEntityManager.save(Roi, {
      datasetId, userId: testUser.id, name, isDefault: false, geojson: { type: 'Feature', properties: { name } }, groupLabel,
    } as any) as Promise<Roi>
    tumor1 = await saveRoi('Tumor 1', 'Tumor')
    tumor2 = await saveRoi('Tumor 2', 'Tumor')
    square = await saveRoi('Square', null)
    stroma = await saveRoi('Stroma', null)

    // A vs_rest run: the two members of "Tumor" share the pooled lfc/auc and differ only in roiLfc
    const [first, second] = annotationIds
    const row = (roi: Roi, annotationId: number, lfc: number, auc: number, roiLfc: number) =>
      ({ roiId: roi.id, annotationId, lfc, auc, roiLfc, groupLabel: roi.groupLabel, referenceLabel: null })
    await testEntityManager.save(DiffRoi, [
      row(tumor1, first, 2, 0.9, 2.5), row(tumor2, first, 2, 0.9, -0.5),
      row(tumor1, second, 1, 0.6, 1.5), row(tumor2, second, 1, 0.6, 0.5),
      row(square, first, -1, 0.3, -1), row(square, second, -2, 0.8, -2),
      row(stroma, first, -3, 0.2, -3), row(stroma, second, -4, 0.1, -4),
    ] as any)
  })
  afterEach(async() => {
    await onAfterEach()
    jest.clearAllMocks()
  })

  const run = (filter: any = {}) => doQuery<any[]>(diffRoiResultsQuery, { datasetId, filter })
  const summary = (results: any[]) => results
    .map(r => [r.groupLabel, Number(r.annotation.id.split('_').pop()), r.nRois, r.nConcordant])
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1])

  it('collapses the member rows of a group into one result per annotation', async() => {
    const [first, second] = annotationIds
    const results = await run()

    expect(summary(results)).toEqual([
      ['Square', first, 1, null], ['Square', second, 1, null],
      ['Stroma', first, 1, null], ['Stroma', second, 1, null],
      ['Tumor', first, 2, 1], ['Tumor', second, 2, 2],
    ])
    const tumor = results.find(r => r.groupLabel === 'Tumor')
    expect(tumor.roiIds).toEqual([tumor1.id, tumor2.id])
    expect(tumor.roi).toEqual({ id: tumor1.id, name: 'Tumor 1', geojson: JSON.stringify(tumor1.geojson) })
    expect(results.find(r => r.groupLabel === 'Square').roi.geojson).toBe(JSON.stringify(square.geojson))
  })

  it('filters by a grouped ROI id, keeping the whole group', async() => {
    const [first, second] = annotationIds
    const results = await run({ roiId: tumor2.id })

    expect(summary(results)).toEqual([['Tumor', first, 2, 1], ['Tumor', second, 2, 2]])
    expect(results[0].roiIds).toEqual([tumor1.id, tumor2.id])
  })

  it('filters by an ungrouped ROI id', async() => {
    const [first, second] = annotationIds
    const results = await run({ roiId: square.id })

    expect(summary(results)).toEqual([['Square', first, 1, null], ['Square', second, 1, null]])
    expect(results[0].roiIds).toEqual([square.id])
  })

  it('returns nothing for a ROI id outside the caller\'s ROIs', async() => {
    const other = await createTestDataset()
    const foreign = await testEntityManager.save(Roi, {
      datasetId: other.id, userId: testUser.id, name: 'Foreign', isDefault: false, geojson: {}, groupLabel: 'Tumor',
    } as any) as Roi
    await testEntityManager.save(DiffRoi, {
      roiId: foreign.id, annotationId: annotationIds[0], lfc: 1, auc: 1, groupLabel: 'Tumor',
    } as any)

    expect(await run({ roiId: foreign.id })).toEqual([])
  })

  it('filters roiName with ILIKE on the ROI name, wildcards included', async() => {
    const [first, second] = annotationIds
    const square2 = [['Square', first, 1, null], ['Square', second, 1, null]]

    expect(summary(await run({ roiName: '_quare' }))).toEqual(square2)
    expect(summary(await run({ roiName: 'SQUA' }))).toEqual(square2)
    expect(summary(await run({ roiName: 's%r' }))).toEqual([...square2, ['Stroma', first, 1, null], ['Stroma', second, 1, null]])
    expect(await run({ roiName: 'xquare' })).toEqual([])
  })

  it('filters roiName on the group label for grouped rows, keeping the whole group', async() => {
    const [first, second] = annotationIds

    expect(summary(await run({ roiName: 'tumo' }))).toEqual([['Tumor', first, 2, 1], ['Tumor', second, 2, 2]])
    // The member ROI names are not what a grouped row is called
    expect(await run({ roiName: 'Tumor 1' })).toEqual([])
  })

  it('keeps the top N annotations by AUC per ROI or group', async() => {
    const [first, second] = annotationIds
    const results = await run({ topNAnnotations: 1 })

    expect(summary(results)).toEqual([['Square', second, 1, null], ['Stroma', first, 1, null], ['Tumor', first, 2, 1]])
  })
})

const diffRoiResultSetsQuery = `query($datasetId: String!) {
    diffRoiResultSets(datasetId: $datasetId) { groupLabel referenceLabel roiIds referenceRoiIds }
  }`

describe('Dataset queries: diffRoiResultSets', () => {
  let datasetId: string
  let annotationIds: number[]

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockEsConnector.esDatasetByID.mockImplementation(async(id) =>
      Promise.resolve({ _source: { ds_id: id, ds_submitter_id: testUser.id } } as any)
    )

    datasetId = (await createTestDataset()).id
    const moldb = await createTestMolecularDB()
    const job = await testEntityManager.save(Job, { moldbId: moldb.id, datasetId, status: 'FINISHED' } as any) as Job
    annotationIds = []
    for (const formula of ['C6H12O6', 'C5H10O5']) {
      const annotation = await testEntityManager.save(Annotation, {
        jobId: job.id, formula, chemMod: '', neutralLoss: '', adduct: '+H', msm: 0.9, fdr: 0.1, stats: {}, isoImageIds: [],
      } as any) as Annotation
      annotationIds.push(annotation.id)
    }
  })
  afterEach(async() => {
    await onAfterEach()
    jest.clearAllMocks()
  })

  const saveRoi = (name: string, groupLabel: string | null, overrides: any = {}) => testEntityManager.save(Roi, {
    datasetId, userId: testUser.id, name, isDefault: false, geojson: { type: 'Feature', properties: { name } }, groupLabel, ...overrides,
  }) as Promise<Roi>
  // One row per annotation and ROI, as a run writes them
  const saveRows = (rois: Roi[], referenceLabel: string | null, comparisonRois: Roi[] | null) =>
    testEntityManager.save(DiffRoi, rois.flatMap(roi => annotationIds.map(annotationId => ({
      roiId: roi.id,
      annotationId,
      lfc: 1,
      auc: 0.5,
      groupLabel: roi.groupLabel,
      referenceLabel,
      comparisonRoiIds: comparisonRois && comparisonRois.map(r => r.id),
    }))) as any)
  const run = () => doQuery<any[]>(diffRoiResultSetsQuery, { datasetId })

  it('returns one set per ROI for a plain run', async() => {
    const square = await saveRoi('Square', null)
    const stroma = await saveRoi('Stroma', null)
    await saveRows([stroma, square], null, [square, stroma])

    expect(await run()).toEqual([
      { groupLabel: null, referenceLabel: null, roiIds: [square.id], referenceRoiIds: null },
      { groupLabel: null, referenceLabel: null, roiIds: [stroma.id], referenceRoiIds: null },
    ])
    expect(mockEsConnector.esSearchResults).not.toHaveBeenCalled()
  })

  it('returns one set per group for a vs-rest grouped run', async() => {
    const square = await saveRoi('Square', null)
    const tumor1 = await saveRoi('Tumor 1', 'Tumor')
    const stroma1 = await saveRoi('Stroma 1', 'Stroma')
    const tumor2 = await saveRoi('Tumor 2', 'Tumor')
    const all = [square, tumor1, stroma1, tumor2]
    await saveRows([tumor2, stroma1, tumor1, square], null, all)

    expect(await run()).toEqual([
      { groupLabel: null, referenceLabel: null, roiIds: [square.id], referenceRoiIds: null },
      { groupLabel: 'Tumor', referenceLabel: null, roiIds: [tumor1.id, tumor2.id], referenceRoiIds: null },
      { groupLabel: 'Stroma', referenceLabel: null, roiIds: [stroma1.id], referenceRoiIds: null },
    ])
  })

  it('returns the stored reference members of a two-group run, whatever the ROIs are labelled now', async() => {
    const stroma1 = await saveRoi('Stroma 1', 'Stroma')
    const tumor1 = await saveRoi('Tumor 1', 'Tumor')
    const stroma2 = await saveRoi('Stroma 2', 'Stroma')
    const tumor2 = await saveRoi('Tumor 2', 'Tumor')
    await saveRoi('Excluded', 'Stroma', { includeInDiff: false })
    await saveRows([tumor2, tumor1], 'Stroma', [tumor2, stroma2, tumor1, stroma1])
    // Relabelled after the run: the stored ROI set still names it as a reference member
    await testEntityManager.update(Roi, stroma2.id, { groupLabel: 'Other' })

    expect(await run()).toEqual([{
      groupLabel: 'Tumor',
      referenceLabel: 'Stroma',
      roiIds: [tumor1.id, tumor2.id],
      referenceRoiIds: [stroma1.id, stroma2.id],
    }])
  })

  it('returns null reference members for two-group rows written before the ROI set was stored', async() => {
    const tumor1 = await saveRoi('Tumor 1', 'Tumor')
    const tumor2 = await saveRoi('Tumor 2', 'Tumor')
    await saveRoi('Stroma 1', 'Stroma')
    await saveRows([tumor1, tumor2], 'Stroma', null)

    expect(await run()).toEqual([
      { groupLabel: 'Tumor', referenceLabel: 'Stroma', roiIds: [tumor1.id, tumor2.id], referenceRoiIds: null },
    ])
  })

  it('returns only the sets of the caller\'s own ROIs, or of the default ROIs when they have none', async() => {
    const mine = await saveRoi('Mine', null)
    const defaultRoi = await saveRoi('Default', null, { userId: adminUser.id, isDefault: true })
    const theirs = await saveRoi('Theirs', null, { userId: adminUser.id })
    await saveRows([mine], null, [mine])
    await saveRows([defaultRoi, theirs], null, [defaultRoi, theirs])

    expect(await run()).toEqual([
      { groupLabel: null, referenceLabel: null, roiIds: [mine.id], referenceRoiIds: null },
    ])

    await testEntityManager.delete(Roi, mine.id)
    expect(await run()).toEqual([
      { groupLabel: null, referenceLabel: null, roiIds: [defaultRoi.id], referenceRoiIds: null },
    ])
  })

  it('returns nothing when the caller cannot see the dataset', async() => {
    const square = await saveRoi('Square', null)
    await saveRows([square], null, [square])
    mockEsConnector.esDatasetByID.mockResolvedValue(null)

    expect(await run()).toEqual([])
  })

  it('returns nothing when there are no results', async() => {
    await saveRoi('Square', null)

    expect(await run()).toEqual([])
  })
})
