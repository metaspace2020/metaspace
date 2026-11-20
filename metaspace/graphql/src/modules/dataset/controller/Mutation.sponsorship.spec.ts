jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'

import * as _smApiDatasets from '../../../utils/smApi/datasets'
jest.mock('../../../utils/smApi/datasets')

jest.mock('../../plan/util/canPerformAction')
import * as _planActions from '../../plan/util/canPerformAction'

jest.mock('../../plan/util/betaTesterApi')
import * as _betaTesterApi from '../../plan/util/betaTesterApi'

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
  createTestDataset,
  createTestDatasetProject,
  createTestMolecularDB,
  createTestProject,
  createTestUserProject,
} from '../../../tests/testDataCreation'
import { Project, UserProjectRoleOptions as UPRO } from '../../project/model'
import { In } from 'typeorm'
import { Annotation, DiffRoi, Job, Roi } from '../../engine/model'
import { resolveComparison } from '../operation/roiGroups'

const mockEsConnector = _mockEsConnector as jest.Mocked<typeof _mockEsConnector>
const mockSmApiDatasets = _smApiDatasets as jest.Mocked<typeof _smApiDatasets>
const mockPlanActions = _planActions as jest.Mocked<typeof _planActions>
const mockBetaTesterApi = _betaTesterApi as jest.Mocked<typeof _betaTesterApi>

describe('Dataset mutations: plan action projectIds (project sponsorship)', () => {
  let memberProject: Project
  let reviewerProject: Project

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockSmApiDatasets.smApiDatasetRequest.mockResolvedValue({ status: 'ok' } as any)
    mockBetaTesterApi.hasBetaFeature.mockResolvedValue(false)
    memberProject = await createTestProject({ name: 'member', isPublic: false })
    reviewerProject = await createTestProject({ name: 'reviewer', isPublic: false })
    await createTestUserProject(testUser.id, memberProject.id, UPRO.MEMBER)
    await createTestUserProject(testUser.id, reviewerProject.id, UPRO.REVIEWER)
  })
  afterEach(async() => {
    await onAfterEach()
    jest.clearAllMocks()
  })

  const setEsProjectIds = (projectIds: string[]) => {
    mockEsConnector.esDatasetByID.mockImplementation(async(id) =>
      Promise.resolve({ _source: { ds_id: id, ds_submitter_id: testUser.id, ds_project_ids: projectIds } } as any)
    )
  }

  const expectActionProjectIds = (actionType: string, projectIds: string[]) => {
    expect(mockPlanActions.assertCanPerformAction).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ actionType, projectIds }))
  }

  describe('updateDataset', () => {
    const updateDatasetQuery = `mutation($datasetId: String!, $input: DatasetUpdateInput!) {
        updateDataset(id: $datasetId, input: $input)
      }`

    it('uses the dataset\'s current projects when the input has no projectIds', async() => {
      const dataset = await createTestDataset()
      await createTestDatasetProject(memberProject.id, dataset.id)
      await createTestDatasetProject(reviewerProject.id, dataset.id)

      await doQuery(updateDatasetQuery, { datasetId: dataset.id, input: { name: 'renamed' } })

      expectActionProjectIds('update', [memberProject.id])
    })

    it('uses the input projectIds when given, even if empty', async() => {
      const dataset = await createTestDataset()
      await createTestDatasetProject(memberProject.id, dataset.id)

      await doQuery(updateDatasetQuery, { datasetId: dataset.id, input: { projectIds: [] } })

      expectActionProjectIds('update', [])
    })
  })

  describe('reprocessDataset', () => {
    const reprocessDatasetQuery = 'mutation($id: String!) { reprocessDataset(id: $id) }'

    it('uses the dataset\'s current projects for the reprocess action', async() => {
      const dataset = await createTestDataset()
      await createTestDatasetProject(memberProject.id, dataset.id)
      await createTestDatasetProject(reviewerProject.id, dataset.id)

      await doQuery(reprocessDatasetQuery, { id: dataset.id })

      expectActionProjectIds('reprocess', [memberProject.id])
    })
  })

  describe('compareROIs', () => {
    const compareROIsQuery = 'mutation($datasetId: String!) { compareROIs(datasetId: $datasetId) }'

    const createRois = async(datasetId: string, specs: Array<[string, string | null, boolean]>) => {
      const rois = []
      for (const [name, groupLabel, includeInDiff] of specs) {
        rois.push(await testEntityManager.save(testEntityManager.create(Roi, {
          datasetId, userId: testUser.id, name, isDefault: false, geojson: {}, groupLabel, includeInDiff,
        })))
      }
      return rois
    }

    it('sends only the ES dataset projects where the user is a member', async() => {
      const dataset = await createTestDataset()
      await createRois(dataset.id, [['a', null, true], ['b', null, true]])
      setEsProjectIds([memberProject.id, reviewerProject.id])

      const result = await doQuery(compareROIsQuery, { datasetId: dataset.id })

      expect(result).toBe(true)
      expectActionProjectIds('diffAnalysis', [memberProject.id])
    })

    it('sends included and scope ROI ids to the engine', async() => {
      const dataset = await createTestDataset()
      const [a, b, c] = await createRois(dataset.id, [['a', 'x', true], ['b', 'y', true], ['c', 'z', false]])
      setEsProjectIds([memberProject.id])

      await doQuery(compareROIsQuery, { datasetId: dataset.id })

      expect(mockSmApiDatasets.smApiDatasetRequest).toHaveBeenCalledWith(
        '/v1/diffroi/compareROIs',
        expect.objectContaining({ roi_ids: [a.id, b.id], scope_roi_ids: [a.id, b.id, c.id] }))
    })

    it('rejects a comparison with fewer than two included groups', async() => {
      const dataset = await createTestDataset()
      await createRois(dataset.id, [['a', 'x', true], ['b', 'x', true]])
      setEsProjectIds([memberProject.id])

      await expect(doQuery(compareROIsQuery, { datasetId: dataset.id })).rejects.toThrow(/two ROI groups/)
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
    })
  })

  describe('compareROIs skips an identical comparison', () => {
    const compareROIsQuery = 'mutation($datasetId: String!) { compareROIs(datasetId: $datasetId) }'
    let datasetId: string
    let annotationId: number

    const saveRoi = (name: string, groupLabel: string | null, includeInDiff = true) =>
      testEntityManager.save(Roi, {
        datasetId, userId: testUser.id, name, isDefault: false, geojson: {}, groupLabel, includeInDiff,
      } as any) as Promise<Roi>
    const engineCalls = () => mockSmApiDatasets.smApiDatasetRequest.mock.calls.length
    const compare = () => doQuery(compareROIsQuery, { datasetId })

    beforeEach(async() => {
      datasetId = (await createTestDataset()).id
      setEsProjectIds([])
      const moldb = await createTestMolecularDB()
      const job = await testEntityManager.save(Job, { moldbId: moldb.id, datasetId, status: 'FINISHED' } as any) as Job
      annotationId = (await testEntityManager.save(Annotation, {
        jobId: job.id, formula: 'H2O', chemMod: '', neutralLoss: '', adduct: '+H', msm: 1, fdr: 0.1, stats: {}, isoImageIds: [],
      } as any) as Annotation).id
      // Stand-in for the engine: replace the rows of the ROIs in scope, one row per ROI of each scored group,
      // written with the engine's column list (comparison_roi_ids is not part of it)
      mockSmApiDatasets.smApiDatasetRequest.mockImplementation(async(uri: string, args: any) => {
        const included = await testEntityManager.find(Roi, { where: { id: In(args.roi_ids) }, order: { id: 'ASC' } })
        await testEntityManager.delete(DiffRoi, { roiId: In(args.scope_roi_ids) })
        await testEntityManager.save(DiffRoi, resolveComparison(included).expectedRows
          .map(row => ({ ...row, annotationId, lfc: 1, auc: 0.5 })) as any)
        return { status: 'success' }
      })
    })

    it('calls the engine once for an unchanged two-group comparison and stores the included ROIs', async() => {
      const [a, b, c] = [await saveRoi('1', 'A'), await saveRoi('2', 'B'), await saveRoi('3', 'B')]

      expect(await compare()).toBe(true)
      expect(await compare()).toBe(true)

      expect(engineCalls()).toBe(1)
      expect(mockPlanActions.performAction).toHaveBeenCalledTimes(1)
      const rows = await testEntityManager.find(DiffRoi, { where: { roiId: In([a.id, b.id, c.id]) } })
      expect(rows.map(row => [row.roiId, row.comparisonRoiIds])).toEqual([[a.id, [a.id, b.id, c.id]]])
    })

    it('recalculates when a ROI leaves the reference group', async() => {
      const rois = [await saveRoi('1', 'A'), await saveRoi('2', 'B'), await saveRoi('3', 'B')]
      await compare()

      await testEntityManager.update(Roi, rois[2].id, { groupLabel: null, includeInDiff: false })
      await compare()

      expect(engineCalls()).toBe(2)
      expect(mockSmApiDatasets.smApiDatasetRequest).toHaveBeenLastCalledWith(
        '/v1/diffroi/compareROIs', expect.objectContaining({ roi_ids: [rois[0].id, rois[1].id] }))
    })

    it('recalculates when a ROI joins the reference group', async() => {
      await saveRoi('1', 'A')
      await saveRoi('2', 'B')
      await saveRoi('3', 'B')
      await compare()

      await saveRoi('4', 'B')
      await compare()
      await compare()

      expect(engineCalls()).toBe(2)
    })

    it('recalculates a two-group run whose rows have no stored ROI set, but not a vs_rest one', async() => {
      const [a] = [await saveRoi('1', 'A'), await saveRoi('2', 'B')]
      await testEntityManager.save(DiffRoi, {
        roiId: a.id, annotationId, lfc: 1, auc: 0.5, groupLabel: 'A', referenceLabel: 'B',
      } as any)
      await compare()
      expect(engineCalls()).toBe(1)

      const other = await createTestDataset()
      datasetId = other.id
      const [x, y] = [await saveRoi('x', null), await saveRoi('y', null)]
      await testEntityManager.save(DiffRoi, [x, y].map(roi => ({ roiId: roi.id, annotationId, lfc: 1, auc: 0.5 })) as any)
      await compare()
      expect(engineCalls()).toBe(1)
    })
  })

  describe('runSegmentation', () => {
    const runSegmentationQuery = `mutation(
        $datasetId: String!, $algorithm: String!, $databaseIds: [Int!]!,
        $fdr: Float, $adducts: [String!], $minMz: Float, $maxMz: Float,
        $offSample: Boolean, $params: String
      ) {
        runSegmentation(
          datasetId: $datasetId, algorithm: $algorithm, databaseIds: $databaseIds,
          fdr: $fdr, adducts: $adducts, minMz: $minMz, maxMz: $maxMz,
          offSample: $offSample, params: $params
        )
      }`

    it('sends only the ES dataset projects where the user is a member', async() => {
      const dataset = await createTestDataset()
      setEsProjectIds([memberProject.id, reviewerProject.id])

      await doQuery(runSegmentationQuery, { datasetId: dataset.id, algorithm: 'pca_gmm', databaseIds: [] })

      expectActionProjectIds('segmentation', [memberProject.id])
    })
  })
})
