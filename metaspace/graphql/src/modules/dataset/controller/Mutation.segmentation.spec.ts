jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'

import * as _smApiDatasets from '../../../utils/smApi/datasets'
jest.mock('../../../utils/smApi/datasets')

import {
  anonContext,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser,
  userContext,
} from '../../../tests/graphqlTestEnvironment'
import { createTestDataset, createTestUser } from '../../../tests/testDataCreation'
import { getContextForTest } from '../../../getContext'
import {
  ImageSegmentationJob,
  Segmentation,
} from '../../engine/model'

const mockEsConnector = _mockEsConnector as jest.Mocked<typeof _mockEsConnector>
const mockSmApiDatasets = _smApiDatasets as jest.Mocked<typeof _smApiDatasets>

describe('Dataset mutations: segmentation', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockSmApiDatasets.smApiDatasetRequest.mockResolvedValue({ status: 'ok' } as any)
    mockEsConnector.esDatasetByID.mockImplementation(async(id) =>
      Promise.resolve({ _source: { ds_id: id, ds_submitter_id: testUser.id } } as any)
    )
  })
  afterEach(async() => {
    await onAfterEach()
    jest.clearAllMocks()
  })

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

  const updateSegmentationQuery = `mutation($id: ID!, $name: String!) {
      updateSegmentation(id: $id, name: $name) { id name }
    }`

  describe('runSegmentation', () => {
    it('rejects unauthenticated requests', async() => {
      const dataset = await createTestDataset()
      await expect(
        doQuery(runSegmentationQuery, {
          datasetId: dataset.id, algorithm: 'pca_gmm', databaseIds: [],
        }, { context: anonContext })
      ).rejects.toThrowError(/Not authenticated/)
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
    })

    it('rejects when dataset is not found', async() => {
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      await expect(
        doQuery(runSegmentationQuery, {
          datasetId: 'missing', algorithm: 'pca_gmm', databaseIds: [],
        })
      ).rejects.toThrowError(/Dataset not found/)
    })

    it('submits to sm-api and clears any prior segmentation rows', async() => {
      const dataset = await createTestDataset()
      // pre-existing rows that should be wiped
      await testEntityManager.save(ImageSegmentationJob, {
        datasetId: dataset.id, status: 'FINISHED',
      })
      await testEntityManager.save(Segmentation, {
        datasetId: dataset.id, segmentIndex: 0, algorithm: 'pca_gmm', status: 'FINISHED',
      })

      const result = await doQuery(runSegmentationQuery, {
        datasetId: dataset.id,
        algorithm: 'pca_gmm',
        databaseIds: [1, 2],
        fdr: 0.1,
        adducts: ['+H'],
        minMz: 100,
        maxMz: 1000,
        offSample: false,
        params: JSON.stringify({ k: 5 }),
      })

      expect(result).toBe(true)
      expect(mockSmApiDatasets.smApiDatasetRequest).toHaveBeenCalledWith(
        '/v1/segmentation/run',
        expect.objectContaining({
          ds_id: dataset.id,
          algorithm: 'pca_gmm',
          database_ids: [1, 2],
          fdr: 0.1,
          adducts: ['+H'],
          min_mz: 100,
          max_mz: 1000,
          off_sample: false,
          params: { k: 5 },
        })
      )

      const remainingSegs = await testEntityManager.find(Segmentation, { where: { datasetId: dataset.id } })
      const remainingJobs = await testEntityManager.find(ImageSegmentationJob, { where: { datasetId: dataset.id } })
      expect(remainingSegs).toHaveLength(0)
      expect(remainingJobs).toHaveLength(0)
    })

    it('wraps sm-api errors as a user error', async() => {
      const dataset = await createTestDataset()
      mockSmApiDatasets.smApiDatasetRequest.mockRejectedValueOnce(new Error('boom'))
      await expect(
        doQuery(runSegmentationQuery, {
          datasetId: dataset.id, algorithm: 'pca_gmm', databaseIds: [],
        })
      ).rejects.toThrowError(/Failed to submit segmentation job/)
    })
  })

  describe('updateSegmentation', () => {
    let segCounter = 0
    const createSeg = async(datasetId: string, name = 'old') => {
      segCounter += 1
      const id = `aaaaaaaa-aaaa-aaaa-aaaa-${String(segCounter).padStart(12, '0')}`
      await testEntityManager.save(Segmentation, {
        id, datasetId, segmentIndex: 0, algorithm: 'pca_gmm', status: 'FINISHED', name,
      })
      return { id }
    }

    it('rejects unauthenticated requests', async() => {
      const dataset = await createTestDataset()
      const seg = await createSeg(dataset.id)
      await expect(
        doQuery(updateSegmentationQuery, { id: seg.id, name: 'new' }, { context: anonContext })
      ).rejects.toThrowError(/Not authenticated/)
    })

    it('rejects when segmentation does not exist', async() => {
      await expect(
        doQuery(updateSegmentationQuery, {
          id: '00000000-0000-0000-0000-000000000000', name: 'new',
        })
      ).rejects.toThrowError(/Segmentation not found/)
    })

    it('rejects when the dataset is not visible', async() => {
      const dataset = await createTestDataset()
      const seg = await createSeg(dataset.id)
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      await expect(
        doQuery(updateSegmentationQuery, { id: seg.id, name: 'new' })
      ).rejects.toThrowError(/Dataset not found/)
    })

    it('rejects when the user lacks edit permission', async() => {
      const otherUser = await createTestUser()
      const dataset = await createTestDataset({ userId: otherUser.id })
      const seg = await createSeg(dataset.id)
      mockEsConnector.esDatasetByID.mockResolvedValueOnce({
        _source: { ds_id: dataset.id, ds_submitter_id: otherUser.id },
      } as any)
      const ctx = getContextForTest({ ...testUser } as any, testEntityManager)
      await expect(
        doQuery(updateSegmentationQuery, { id: seg.id, name: 'new' }, { context: ctx })
      ).rejects.toThrowError(/permission/)
    })

    it('updates name when permitted', async() => {
      const dataset = await createTestDataset()
      const seg = await createSeg(dataset.id, 'old')
      const result = await doQuery<{ id: string, name: string }>(
        updateSegmentationQuery, { id: seg.id, name: '  fresh name  ' }, { context: userContext }
      )
      expect(result.id).toBe(seg.id)
      expect(result.name).toBe('fresh name')
      const reloaded = await testEntityManager.findOneOrFail(Segmentation, seg.id)
      expect(reloaded.name).toBe('fresh name')
    })
  })
})
