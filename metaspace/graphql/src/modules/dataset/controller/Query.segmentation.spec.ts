jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'
import * as moment from 'moment'

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
} from '../../../tests/graphqlTestEnvironment'
import {
  createTestDataset,
  createTestMolecularDB,
  createTestUser,
} from '../../../tests/testDataCreation'
import {
  Annotation,
  ImageSegmentationJob,
  Job,
  Segmentation,
  SegmentationIonProfile,
} from '../../engine/model'
import { getContextForTest } from '../../../getContext'

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

  const saveJob = async(fields: Partial<Omit<ImageSegmentationJob, 'createdAt'>> & { createdAt?: moment.Moment }) => {
    const createdAt = fields.createdAt || moment('2024-01-01')
    return await testEntityManager.save(ImageSegmentationJob, {
      status: 'FINISHED',
      isDefault: true,
      userId: null,
      ...fields,
      createdAt,
      updatedAt: createdAt,
    } as any) as ImageSegmentationJob
  }

  describe('segmentationJob', () => {
    const query = `query($datasetId: String!) {
        segmentationJob(datasetId: $datasetId) { id isDefault isMine userId resultData labelMapUrl }
      }`

    it('returns null when the dataset is not visible', async() => {
      const dataset = await createTestDataset()
      await saveJob({ datasetId: dataset.id })
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      const result = await doQuery<any>(query, { datasetId: dataset.id })
      expect(result).toBeNull()
    })

    it('returns the FINISHED default job for a user without a private job', async() => {
      const dataset = await createTestDataset()
      const other = await createTestUser()
      const defaultJob = await saveJob({ datasetId: dataset.id })
      await saveJob({ datasetId: dataset.id, isDefault: false, userId: other.id, createdAt: moment('2024-06-01') })
      const result = await doQuery<any>(query, { datasetId: dataset.id })
      expect(result).toEqual(expect.objectContaining({ id: Number(defaultJob.id), isDefault: true, isMine: false }))
    })

    it('prefers the caller\'s FINISHED private job over a newer default', async() => {
      const dataset = await createTestDataset()
      const privateJob = await saveJob({
        datasetId: dataset.id, isDefault: false, userId: testUser.id, createdAt: moment('2024-01-01'),
      })
      await saveJob({ datasetId: dataset.id, createdAt: moment('2024-06-01') })
      const result = await doQuery<any>(query, { datasetId: dataset.id })
      expect(result).toEqual(expect.objectContaining({
        id: Number(privateJob.id), isDefault: false, isMine: true, userId: testUser.id,
      }))
    })

    it('ignores QUEUED/STARTED jobs', async() => {
      const dataset = await createTestDataset()
      const defaultJob = await saveJob({ datasetId: dataset.id, createdAt: moment('2024-01-01') })
      await saveJob({
        datasetId: dataset.id, status: 'STARTED', isDefault: false, userId: testUser.id, createdAt: moment('2024-06-01'),
      })
      await saveJob({ datasetId: dataset.id, status: 'QUEUED', createdAt: moment('2024-07-01') })
      const result = await doQuery<any>(query, { datasetId: dataset.id })
      expect(result.id).toBe(Number(defaultJob.id))
    })

    it('returns the default only for anonymous users', async() => {
      const withDefault = await createTestDataset()
      const defaultJob = await saveJob({ datasetId: withDefault.id, createdAt: moment('2024-01-01') })
      await saveJob({
        datasetId: withDefault.id, isDefault: false, userId: testUser.id, createdAt: moment('2024-06-01'),
      })
      const onlyPrivate = await createTestDataset()
      await saveJob({ datasetId: onlyPrivate.id, isDefault: false, userId: testUser.id })

      const anonDefault = await doQuery<any>(query, { datasetId: withDefault.id }, { context: anonContext })
      expect(anonDefault).toEqual(expect.objectContaining({ id: Number(defaultJob.id), isMine: false }))
      const anonPrivate = await doQuery<any>(query, { datasetId: onlyPrivate.id }, { context: anonContext })
      expect(anonPrivate).toBeNull()
    })

    it('exposes resultData and labelMapUrl from the job row', async() => {
      const dataset = await createTestDataset()
      await saveJob({
        datasetId: dataset.id,
        result: { n_segments: 2 },
        labelMapImageId: 'img',
        labelMapImageUrl: 'http://x/img',
      })
      const result = await doQuery<any>(query, { datasetId: dataset.id })
      expect(JSON.parse(result.resultData)).toEqual({ n_segments: 2 })
      expect(result.labelMapUrl).toBe('http://x/img')
    })

    it('returns null resultData and labelMapUrl when the job has no result', async() => {
      const dataset = await createTestDataset()
      await saveJob({ datasetId: dataset.id })
      const result = await doQuery<any>(query, { datasetId: dataset.id })
      expect(result.isDefault).toBe(true)
      expect(result.resultData).toBeNull()
      expect(result.labelMapUrl).toBeNull()
    })
  })

  describe('segmentationJobs', () => {
    const query = `query($datasetId: String!) {
        segmentationJobs(datasetId: $datasetId) { id datasetId status isDefault isMine }
      }`

    it('returns [] when the dataset is not visible', async() => {
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      const result = await doQuery<any[]>(query, { datasetId: 'missing' })
      expect(result).toEqual([])
    })

    it('returns default jobs plus the caller\'s own jobs, newest first', async() => {
      const dataset = await createTestDataset()
      const other = await createTestUser()
      const defaultJob = await saveJob({ datasetId: dataset.id, createdAt: moment('2024-01-01') })
      const mine = await saveJob({
        datasetId: dataset.id, status: 'STARTED', isDefault: false, userId: testUser.id, createdAt: moment('2024-06-01'),
      })
      await saveJob({ datasetId: dataset.id, isDefault: false, userId: other.id, createdAt: moment('2024-07-01') })
      const result = await doQuery<any[]>(query, { datasetId: dataset.id })
      expect(result.map(j => j.id)).toEqual([Number(mine.id), Number(defaultJob.id)])
      expect(result.map(j => j.isMine)).toEqual([true, false])
    })
  })

  describe('segmentations', () => {
    const query = `query($datasetId: String!) {
        segmentations(datasetId: $datasetId) { id jobId segmentIndex algorithm }
      }`

    it('returns [] when the dataset is not visible', async() => {
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      const result = await doQuery<any[]>(query, { datasetId: 'missing' })
      expect(result).toEqual([])
    })

    it('returns the segments of the visible job only, ordered by segmentIndex', async() => {
      const dataset = await createTestDataset()
      const defaultJob = await saveJob({ datasetId: dataset.id, createdAt: moment('2024-06-01') })
      const mine = await saveJob({
        datasetId: dataset.id, isDefault: false, userId: testUser.id, createdAt: moment('2024-01-01'),
      })
      await testEntityManager.save(Segmentation, [
        { datasetId: dataset.id, jobId: mine.id, segmentIndex: 1, algorithm: 'kmeans', status: 'FINISHED' },
        { datasetId: dataset.id, jobId: defaultJob.id, segmentIndex: 0, algorithm: 'pca_gmm', status: 'FINISHED' },
        { datasetId: dataset.id, jobId: mine.id, segmentIndex: 0, algorithm: 'kmeans', status: 'FINISHED' },
      ])
      const result = await doQuery<any[]>(query, { datasetId: dataset.id })
      expect(result.map(s => [s.jobId, s.segmentIndex])).toEqual([[Number(mine.id), 0], [Number(mine.id), 1]])
    })

    it('returns [] for anonymous when only private jobs exist', async() => {
      const dataset = await createTestDataset()
      const mine = await saveJob({ datasetId: dataset.id, isDefault: false, userId: testUser.id })
      await testEntityManager.save(Segmentation, {
        datasetId: dataset.id, jobId: mine.id, segmentIndex: 0, algorithm: 'kmeans', status: 'FINISHED',
      })
      const result = await doQuery<any[]>(query, { datasetId: dataset.id }, { context: anonContext })
      expect(result).toEqual([])
    })
  })

  describe('segmentationJob and segmentations by jobId', () => {
    const jobQuery = `query($datasetId: String!, $jobId: Int) {
        segmentationJob(datasetId: $datasetId, jobId: $jobId) { id isDefault isMine }
      }`
    const segmentsQuery = `query($datasetId: String!, $jobId: Int) {
        segmentations(datasetId: $datasetId, jobId: $jobId) { id jobId segmentIndex }
      }`

    const saveSegment = async(datasetId: string, jobId: number) =>
      testEntityManager.save(Segmentation, {
        datasetId, jobId, segmentIndex: 0, algorithm: 'kmeans', status: 'FINISHED',
      } as any)

    it('returns the caller\'s own private job and its segments by id', async() => {
      const dataset = await createTestDataset()
      await saveJob({ datasetId: dataset.id })
      const mine = await saveJob({ datasetId: dataset.id, isDefault: false, userId: testUser.id })
      await saveSegment(dataset.id, mine.id)
      const job = await doQuery<any>(jobQuery, { datasetId: dataset.id, jobId: Number(mine.id) })
      expect(job).toEqual({ id: Number(mine.id), isDefault: false, isMine: true })
      const segments = await doQuery<any[]>(segmentsQuery, { datasetId: dataset.id, jobId: Number(mine.id) })
      expect(segments.map(s => s.jobId)).toEqual([Number(mine.id)])
    })

    it('returns the default job by id even when the caller has a private job', async() => {
      const dataset = await createTestDataset()
      const defaultJob = await saveJob({ datasetId: dataset.id })
      await saveJob({ datasetId: dataset.id, isDefault: false, userId: testUser.id, createdAt: moment('2024-06-01') })
      await saveSegment(dataset.id, defaultJob.id)
      const job = await doQuery<any>(jobQuery, { datasetId: dataset.id, jobId: Number(defaultJob.id) })
      expect(job).toEqual({ id: Number(defaultJob.id), isDefault: true, isMine: false })
      const segments = await doQuery<any[]>(segmentsQuery, { datasetId: dataset.id, jobId: Number(defaultJob.id) })
      expect(segments.map(s => s.jobId)).toEqual([Number(defaultJob.id)])
    })

    it('returns the default job by id to another viewer and to anonymous users', async() => {
      const dataset = await createTestDataset()
      const owner = await createTestUser()
      const defaultJob = await saveJob({ datasetId: dataset.id, userId: owner.id })
      await saveSegment(dataset.id, defaultJob.id)
      const vars = { datasetId: dataset.id, jobId: Number(defaultJob.id) }
      const asViewer = await doQuery<any>(jobQuery, vars)
      expect(asViewer).toEqual(expect.objectContaining({ id: Number(defaultJob.id) }))
      const asAnon = await doQuery<any>(jobQuery, vars, { context: anonContext })
      expect(asAnon).toEqual(expect.objectContaining({ id: Number(defaultJob.id) }))
      const anonSegments = await doQuery<any[]>(segmentsQuery, vars, { context: anonContext })
      expect(anonSegments).toHaveLength(1)
    })

    it('returns null and [] for a private job of another user', async() => {
      const dataset = await createTestDataset()
      const other = await createTestUser()
      const theirs = await saveJob({ datasetId: dataset.id, isDefault: false, userId: other.id })
      await saveSegment(dataset.id, theirs.id)
      const vars = { datasetId: dataset.id, jobId: Number(theirs.id) }
      expect(await doQuery<any>(jobQuery, vars)).toBeNull()
      expect(await doQuery<any[]>(segmentsQuery, vars)).toEqual([])
      expect(await doQuery<any>(jobQuery, vars, { context: anonContext })).toBeNull()
    })

    it('returns null and [] for a job of another dataset', async() => {
      const dataset = await createTestDataset()
      const otherDataset = await createTestDataset()
      const foreign = await saveJob({ datasetId: otherDataset.id })
      await saveSegment(otherDataset.id, foreign.id)
      const vars = { datasetId: dataset.id, jobId: Number(foreign.id) }
      expect(await doQuery<any>(jobQuery, vars)).toBeNull()
      expect(await doQuery<any[]>(segmentsQuery, vars)).toEqual([])
    })

    it('returns null and [] for a job that is not FINISHED', async() => {
      const dataset = await createTestDataset()
      const queued = await saveJob({ datasetId: dataset.id, status: 'QUEUED', isDefault: false, userId: testUser.id })
      await saveSegment(dataset.id, queued.id)
      const vars = { datasetId: dataset.id, jobId: Number(queued.id) }
      expect(await doQuery<any>(jobQuery, vars)).toBeNull()
      expect(await doQuery<any[]>(segmentsQuery, vars)).toEqual([])
    })

    it('returns null when the dataset is not visible', async() => {
      const dataset = await createTestDataset()
      const defaultJob = await saveJob({ datasetId: dataset.id })
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      expect(await doQuery<any>(jobQuery, { datasetId: dataset.id, jobId: Number(defaultJob.id) })).toBeNull()
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
      const segJob = await saveJob({ datasetId: dataset.id })
      await testEntityManager.save(Segmentation, {
        id: SEG_ID_B,
        datasetId: dataset.id,
        jobId: segJob.id,
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
      const segJob = await saveJob({ datasetId: dataset.id })
      await testEntityManager.save(Segmentation, {
        id: SEG_ID_C,
        datasetId: dataset.id,
        jobId: segJob.id,
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

    describe('job visibility', () => {
      const seedProfile = async(jobFields: { isDefault: boolean; userId: string }) => {
        const dataset = await createTestDataset()
        const segJob = await saveJob({ datasetId: dataset.id, ...jobFields })
        const segmentation = await testEntityManager.save(Segmentation, {
          datasetId: dataset.id, jobId: segJob.id, segmentIndex: 0, algorithm: 'kmeans', status: 'FINISHED',
        } as any) as Segmentation
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
          segmentationId: segmentation.id, annotationId: annotation.id, enrichScore: 0.7,
        })
        mockEsConnector.esSearchResults.mockResolvedValue([
          { _id: `${dataset.id}_${annotation.id}`, _source: { centroid_mzs: [181.07] } },
        ] as any)
        return segmentation
      }

      it('returns [] for a segmentation without a job', async() => {
        const segmentation = await seedProfile({ isDefault: true, userId: testUser.id })
        await testEntityManager.update(Segmentation, segmentation.id, { jobId: null } as any)
        const result = await doQuery<any[]>(query, { segmentationId: segmentation.id })
        expect(result).toEqual([])
      })

      it('returns the profiles of a private job to its owner', async() => {
        const segmentation = await seedProfile({ isDefault: false, userId: testUser.id })
        const result = await doQuery<any[]>(query, { segmentationId: segmentation.id })
        expect(result).toEqual([{ enrichScore: 0.7 }])
      })

      it('returns [] for a private job of another user', async() => {
        const other = await createTestUser()
        const segmentation = await seedProfile({ isDefault: false, userId: other.id })
        const result = await doQuery<any[]>(query, { segmentationId: segmentation.id })
        expect(result).toEqual([])
        expect(mockEsConnector.esSearchResults).not.toHaveBeenCalled()
      })

      it('returns [] for a private job to anonymous users', async() => {
        const segmentation = await seedProfile({ isDefault: false, userId: testUser.id })
        const result = await doQuery<any[]>(query, { segmentationId: segmentation.id }, { context: anonContext })
        expect(result).toEqual([])
        expect(mockEsConnector.esSearchResults).not.toHaveBeenCalled()
      })

      it('returns the profiles of a default job to anyone who can view the dataset', async() => {
        const owner = await createTestUser()
        const segmentation = await seedProfile({ isDefault: true, userId: owner.id })
        const other = await createTestUser()
        const otherContext = getContextForTest(other as any, testEntityManager)
        const asOther = await doQuery<any[]>(query, { segmentationId: segmentation.id }, { context: otherContext })
        expect(asOther).toEqual([{ enrichScore: 0.7 }])
        const asAnon = await doQuery<any[]>(query, { segmentationId: segmentation.id }, { context: anonContext })
        expect(asAnon).toEqual([{ enrichScore: 0.7 }])
      })
    })
  })
})
