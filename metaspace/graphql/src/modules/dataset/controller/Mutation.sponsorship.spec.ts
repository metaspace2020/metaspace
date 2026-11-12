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
  testUser,
} from '../../../tests/graphqlTestEnvironment'
import {
  createTestDataset,
  createTestDatasetProject,
  createTestProject,
  createTestUserProject,
} from '../../../tests/testDataCreation'
import { Project, UserProjectRoleOptions as UPRO } from '../../project/model'

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

    it('sends only the ES dataset projects where the user is a member', async() => {
      const dataset = await createTestDataset()
      setEsProjectIds([memberProject.id, reviewerProject.id])

      const result = await doQuery(compareROIsQuery, { datasetId: dataset.id })

      expect(result).toBe(true)
      expectActionProjectIds('diffAnalysis', [memberProject.id])
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
