jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'

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
import { createTestDataset, createTestMolecularDB } from '../../../tests/testDataCreation'
import {
  Annotation,
  ImageSegmentationJob,
  Job,
  Segmentation,
  SegmentationIonProfile,
} from '../../engine/model'

const mockEsConnector = _mockEsConnector as jest.Mocked<typeof _mockEsConnector>

describe('Dataset queries: segmentation', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockEsConnector.esDatasetByID.mockImplementation(async(id) =>
      Promise.resolve({ _source: { ds_id: id, ds_submitter_id: testUser.id } } as any)
    )
    mockEsConnector.esSearchResults.mockResolvedValue([] as any)
  })
  afterEach(async() => {
    await onAfterEach()
    jest.clearAllMocks()
  })

  describe('segmentationJobs', () => {
    const query = `query($datasetId: String!) {
        segmentationJobs(datasetId: $datasetId) { id datasetId status }
      }`

    it('returns [] when the dataset is not visible', async() => {
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      const result = await doQuery<any[]>(query, { datasetId: 'missing' })
      expect(result).toEqual([])
    })

    it('returns the dataset jobs', async() => {
      const dataset = await createTestDataset()
      await testEntityManager.save(ImageSegmentationJob, {
        datasetId: dataset.id, status: 'FINISHED',
      })
      const result = await doQuery<any[]>(query, { datasetId: dataset.id })
      expect(result).toHaveLength(1)
      expect(result[0].datasetId).toBe(dataset.id)
      expect(result[0].status).toBe('FINISHED')
    })
  })

  describe('segmentations', () => {
    const query = `query($datasetId: String!) {
        segmentations(datasetId: $datasetId) { id segmentIndex algorithm }
      }`

    it('returns [] when the dataset is not visible', async() => {
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      const result = await doQuery<any[]>(query, { datasetId: 'missing' })
      expect(result).toEqual([])
    })

    it('returns segments ordered by segmentIndex', async() => {
      const dataset = await createTestDataset()
      await testEntityManager.save(Segmentation, {
        datasetId: dataset.id, segmentIndex: 1, algorithm: 'pca_gmm', status: 'FINISHED',
      })
      await testEntityManager.save(Segmentation, {
        datasetId: dataset.id, segmentIndex: 0, algorithm: 'pca_gmm', status: 'FINISHED',
      })
      const result = await doQuery<any[]>(query, { datasetId: dataset.id })
      expect(result.map(r => r.segmentIndex)).toEqual([0, 1])
    })
  })

  describe('segmentationIonProfiles', () => {
    const query = `query($segmentationId: ID!, $filter: SegmentationIonProfileFilter) {
        segmentationIonProfiles(segmentationId: $segmentationId, filter: $filter) {
          enrichScore
        }
      }`

    it('returns [] when segmentation does not exist', async() => {
      const result = await doQuery<any[]>(query, {
        segmentationId: '00000000-0000-0000-0000-000000000000',
      })
      expect(result).toEqual([])
    })

    const SEG_ID_A = '11111111-1111-1111-1111-111111111111'
    const SEG_ID_B = '22222222-2222-2222-2222-222222222222'
    const SEG_ID_C = '33333333-3333-3333-3333-333333333333'

    it('returns [] when the dataset is not visible', async() => {
      const dataset = await createTestDataset()
      await testEntityManager.save(Segmentation, {
        id: SEG_ID_A,
        datasetId: dataset.id,
        segmentIndex: 0,
        algorithm: 'pca_gmm',
        status: 'FINISHED',
      })
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      const result = await doQuery<any[]>(query, { segmentationId: SEG_ID_A })
      expect(result).toEqual([])
    })

    it('returns [] when there are no ion profiles', async() => {
      const dataset = await createTestDataset()
      await testEntityManager.save(Segmentation, {
        id: SEG_ID_B,
        datasetId: dataset.id,
        segmentIndex: 0,
        algorithm: 'pca_gmm',
        status: 'FINISHED',
      })
      const result = await doQuery<any[]>(query, { segmentationId: SEG_ID_B })
      expect(result).toEqual([])
      expect(mockEsConnector.esSearchResults).not.toHaveBeenCalled()
    })

    it('drops profiles with no matching annotation in elasticsearch', async() => {
      const dataset = await createTestDataset()
      await testEntityManager.save(Segmentation, {
        id: SEG_ID_C,
        datasetId: dataset.id,
        segmentIndex: 0,
        algorithm: 'pca_gmm',
        status: 'FINISHED',
      })
      const moldb = await createTestMolecularDB()
      const job = await testEntityManager.save(Job, {
        moldbId: moldb.id, datasetId: dataset.id, status: 'FINISHED',
      } as any) as Job
      const annotation = await testEntityManager.save(Annotation, {
        jobId: job.id,
        formula: 'C6H12O6',
        chemMod: '',
        neutralLoss: '',
        adduct: '+H',
        msm: 0.9,
        fdr: 0.1,
        stats: {},
        isoImageIds: [],
      } as any) as Annotation
      await testEntityManager.save(SegmentationIonProfile, {
        segmentationId: SEG_ID_C, annotationId: annotation.id, enrichScore: 0.9,
      })
      mockEsConnector.esSearchResults.mockResolvedValueOnce([] as any)
      const result = await doQuery<any[]>(query, {
        segmentationId: SEG_ID_C, filter: { minEnrichScore: 0.5, topN: 5 },
      })
      expect(result).toEqual([])
      expect(mockEsConnector.esSearchResults).toHaveBeenCalledWith(
        expect.objectContaining({ filter: expect.objectContaining({ annotationId: expect.any(String) }) }),
        'annotation',
        expect.anything()
      )
    })
  })
})
