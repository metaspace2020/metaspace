jest.mock('../../../../esConnector')
import * as _mockEsConnector from '../../../../esConnector'

import * as _smApiDatasets from '../../../utils/smApi/datasets'
jest.mock('../../../utils/smApi/datasets')

jest.mock('../../plan/util/canPerformAction')
import * as _planActions from '../../plan/util/canPerformAction'

jest.mock('../../plan/util/betaTesterApi')
import * as _betaTesterApi from '../../plan/util/betaTesterApi'

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
import {
  createTestDataset,
  createTestProject,
  createTestUser,
} from '../../../tests/testDataCreation'
import {
  ImageSegmentationJob,
  Segmentation,
} from '../../engine/model'
import { Experiment, ExperimentDataset } from '../../experiment/model'
import { User } from '../../user/model'

const mockEsConnector = _mockEsConnector as jest.Mocked<typeof _mockEsConnector>
const mockSmApiDatasets = _smApiDatasets as jest.Mocked<typeof _smApiDatasets>
const mockPlanActions = _planActions as jest.Mocked<typeof _planActions>
const mockBetaTesterApi = _betaTesterApi as jest.Mocked<typeof _betaTesterApi>

describe('Dataset mutations: segmentation', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockSmApiDatasets.smApiDatasetRequest.mockResolvedValue({ status: 'ok' } as any)
    mockBetaTesterApi.hasBetaFeature.mockResolvedValue(false)
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

  const deleteSegmentationJobQuery = 'mutation($id: Int!) { deleteSegmentationJob(id: $id) }'

  const updateSegmentationQuery = `mutation($id: ID!, $name: String!) {
      updateSegmentation(id: $id, name: $name) { id name }
    }`

  /** Makes esDatasetByID report a dataset submitted by someone else with no group, so testUser is only a viewer. */
  const asViewerOf = (otherUser: User) => {
    mockEsConnector.esDatasetByID.mockImplementation(async(id) =>
      Promise.resolve({ _source: { ds_id: id, ds_submitter_id: otherUser.id } } as any)
    )
  }

  const createJob = async(datasetId: string, fields: Partial<ImageSegmentationJob>) => {
    const job = await testEntityManager.save(ImageSegmentationJob, {
      datasetId, status: 'FINISHED', isDefault: true, userId: null, ...fields,
    }) as ImageSegmentationJob
    // save() echoes the generated serial id back as a string; GraphQL Int variables need a number
    return { ...job, id: Number(job.id) }
  }

  let segCounter = 0
  const createSeg = async(datasetId: string, jobId: number | null, name = 'old') => {
    segCounter += 1
    const id = `aaaaaaaa-aaaa-aaaa-aaaa-${String(segCounter).padStart(12, '0')}`
    await testEntityManager.save(Segmentation, {
      id, datasetId, jobId, segmentIndex: 0, algorithm: 'pca_gmm', status: 'FINISHED', name,
    })
    return { id }
  }

  const createExperimentUsing = async(datasetId: string, segmentationId: string, name = 'Mice') => {
    const project = await createTestProject()
    const experiment = await testEntityManager.save(Experiment, {
      projectId: project.id, createdById: testUser.id, name, matchMode: 'name', labelGroups: [],
    }) as Experiment
    await testEntityManager.save(ExperimentDataset, {
      experimentId: experiment.id,
      datasetId,
      regionSource: 'segmentation',
      regions: [{
        regionKey: `${datasetId}:seg:${segmentationId}`,
        sourceKind: 'segmentation_cluster',
        roiId: null,
        segmentationId,
        labelGroupName: null,
        metadata: {
          condition: 'control',
          biologicalReplicateId: 'mouse0',
          sampleId: 's0',
          technicalReplicateId: null,
          batchId: null,
        },
      }],
    })
    return experiment
  }

  const runArgs = (datasetId: string) => ({ datasetId, algorithm: 'pca_gmm', databaseIds: [] })

  describe('runSegmentation', () => {
    it('rejects unauthenticated requests', async() => {
      const dataset = await createTestDataset()
      await expect(
        doQuery(runSegmentationQuery, runArgs(dataset.id), { context: anonContext })
      ).rejects.toThrowError(/Not authenticated/)
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
    })

    it('rejects when dataset is not found', async() => {
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      await expect(
        doQuery(runSegmentationQuery, runArgs('missing'))
      ).rejects.toThrowError(/Dataset not found/)
    })

    it('editor run enqueues a default run and deletes nothing', async() => {
      const otherUser = await createTestUser()
      const dataset = await createTestDataset()
      const defaultJob = await createJob(dataset.id, { userId: otherUser.id, isDefault: true })
      await createSeg(dataset.id, defaultJob.id)
      await createJob(dataset.id, { userId: otherUser.id, isDefault: false })

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
          user_id: testUser.id,
          is_default: true,
        })
      )
      expect(mockPlanActions.performAction).toHaveBeenCalledTimes(1)
      expect(await testEntityManager.find(ImageSegmentationJob, { where: { datasetId: dataset.id } })).toHaveLength(2)
      expect(await testEntityManager.find(Segmentation, { where: { datasetId: dataset.id } })).toHaveLength(1)
    })

    it('viewer run enqueues a private run', async() => {
      const otherUser = await createTestUser()
      const dataset = await createTestDataset({ userId: otherUser.id })
      asViewerOf(otherUser)

      const result = await doQuery(runSegmentationQuery, runArgs(dataset.id))

      expect(result).toBe(true)
      expect(mockSmApiDatasets.smApiDatasetRequest).toHaveBeenCalledWith(
        '/v1/segmentation/run',
        expect.objectContaining({ ds_id: dataset.id, user_id: testUser.id, is_default: false })
      )
    })

    it('rejects a default run while a default job is QUEUED or STARTED', async() => {
      const dataset = await createTestDataset()
      for (const status of ['QUEUED', 'STARTED']) {
        const job = await createJob(dataset.id, { status, isDefault: true })
        await expect(
          doQuery(runSegmentationQuery, runArgs(dataset.id))
        ).rejects.toThrowError('A segmentation is already running for this dataset')
        await testEntityManager.delete(ImageSegmentationJob, job.id)
      }
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
    })

    it('rejects a private run while the caller\'s own job is live but not while another user\'s is', async() => {
      const otherUser = await createTestUser()
      const dataset = await createTestDataset({ userId: otherUser.id })
      asViewerOf(otherUser)
      const ownJob = await createJob(dataset.id, { status: 'STARTED', isDefault: false, userId: testUser.id })

      await expect(
        doQuery(runSegmentationQuery, runArgs(dataset.id))
      ).rejects.toThrowError('A segmentation is already running for this dataset')
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()

      await testEntityManager.delete(ImageSegmentationJob, ownJob.id)
      await createJob(dataset.id, { status: 'QUEUED', isDefault: false, userId: otherUser.id })
      await createJob(dataset.id, { status: 'STARTED', isDefault: true, userId: otherUser.id })

      expect(await doQuery(runSegmentationQuery, runArgs(dataset.id))).toBe(true)
      expect(mockSmApiDatasets.smApiDatasetRequest).toHaveBeenCalledWith(
        '/v1/segmentation/run', expect.objectContaining({ is_default: false })
      )
    })

    it('rejects replacing a segmentation used by an experiment', async() => {
      const dataset = await createTestDataset()
      const job = await createJob(dataset.id, { isDefault: true, userId: testUser.id })
      const seg = await createSeg(dataset.id, job.id)
      await createExperimentUsing(dataset.id, seg.id, 'Mice')

      await expect(
        doQuery(runSegmentationQuery, runArgs(dataset.id))
      ).rejects.toThrowError('This segmentation is used by experiment "Mice"; remove it from the experiment first')
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
      expect(mockPlanActions.performAction).not.toHaveBeenCalled()
    })

    it('wraps sm-api errors as a user error', async() => {
      const dataset = await createTestDataset()
      mockSmApiDatasets.smApiDatasetRequest.mockRejectedValueOnce(new Error('boom'))
      await expect(
        doQuery(runSegmentationQuery, runArgs(dataset.id))
      ).rejects.toThrowError(/Failed to submit segmentation job/)
    })
  })

  describe('deleteSegmentationJob', () => {
    it('rejects unauthenticated requests', async() => {
      const dataset = await createTestDataset()
      const job = await createJob(dataset.id, { isDefault: true })
      await expect(
        doQuery(deleteSegmentationJobQuery, { id: job.id }, { context: anonContext })
      ).rejects.toThrowError(/Not authenticated/)
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
    })

    it('rejects a job that does not exist', async() => {
      await expect(
        doQuery(deleteSegmentationJobQuery, { id: 999999 })
      ).rejects.toThrowError('Segmentation job not found')
    })

    it('lets the owner delete their private job via the engine', async() => {
      const otherUser = await createTestUser()
      const dataset = await createTestDataset({ userId: otherUser.id })
      asViewerOf(otherUser)
      const job = await createJob(dataset.id, { isDefault: false, userId: testUser.id })

      expect(await doQuery(deleteSegmentationJobQuery, { id: job.id })).toBe(true)
      expect(mockSmApiDatasets.smApiDatasetRequest).toHaveBeenCalledWith(
        '/v1/segmentation/delete_job', { ds_id: dataset.id, job_id: job.id }
      )
    })

    it('rejects deleting another user\'s private job', async() => {
      const otherUser = await createTestUser()
      const dataset = await createTestDataset()
      const job = await createJob(dataset.id, { isDefault: false, userId: otherUser.id })

      await expect(
        doQuery(deleteSegmentationJobQuery, { id: job.id })
      ).rejects.toThrowError('You do not have permission to delete this segmentation')
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
    })

    it('lets an editor delete the default job but not a viewer', async() => {
      const otherUser = await createTestUser()
      const dataset = await createTestDataset()
      const job = await createJob(dataset.id, { isDefault: true, userId: otherUser.id })

      asViewerOf(otherUser)
      await expect(
        doQuery(deleteSegmentationJobQuery, { id: job.id })
      ).rejects.toThrowError('You do not have permission to delete this segmentation')
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()

      mockEsConnector.esDatasetByID.mockImplementation(async(id) =>
        Promise.resolve({ _source: { ds_id: id, ds_submitter_id: testUser.id } } as any)
      )
      expect(await doQuery(deleteSegmentationJobQuery, { id: job.id })).toBe(true)
      expect(mockSmApiDatasets.smApiDatasetRequest).toHaveBeenCalledWith(
        '/v1/segmentation/delete_job', { ds_id: dataset.id, job_id: job.id }
      )
    })

    it('rejects a running job', async() => {
      const dataset = await createTestDataset()
      const job = await createJob(dataset.id, { status: 'STARTED', isDefault: false, userId: testUser.id })

      await expect(
        doQuery(deleteSegmentationJobQuery, { id: job.id })
      ).rejects.toThrowError('A segmentation is already running for this dataset')
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
    })

    it('rejects a job used by an experiment', async() => {
      const dataset = await createTestDataset()
      const job = await createJob(dataset.id, { isDefault: false, userId: testUser.id })
      const seg = await createSeg(dataset.id, job.id)
      await createExperimentUsing(dataset.id, seg.id, 'Mice')

      await expect(
        doQuery(deleteSegmentationJobQuery, { id: job.id })
      ).rejects.toThrowError('This segmentation is used by experiment "Mice"; remove it from the experiment first')
      expect(mockSmApiDatasets.smApiDatasetRequest).not.toHaveBeenCalled()
    })
  })

  describe('updateSegmentation', () => {
    it('rejects unauthenticated requests', async() => {
      const dataset = await createTestDataset()
      const seg = await createSeg(dataset.id, null)
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
      const seg = await createSeg(dataset.id, null)
      mockEsConnector.esDatasetByID.mockResolvedValueOnce(null as any)
      await expect(
        doQuery(updateSegmentationQuery, { id: seg.id, name: 'new' })
      ).rejects.toThrowError(/Dataset not found/)
    })

    it('lets the owner rename a segment of their private job', async() => {
      const otherUser = await createTestUser()
      const dataset = await createTestDataset({ userId: otherUser.id })
      asViewerOf(otherUser)
      const job = await createJob(dataset.id, { isDefault: false, userId: testUser.id })
      const seg = await createSeg(dataset.id, job.id, 'old')

      const result = await doQuery<{ id: string, name: string }>(
        updateSegmentationQuery, { id: seg.id, name: '  fresh name  ' }, { context: userContext }
      )
      expect(result.id).toBe(seg.id)
      expect(result.name).toBe('fresh name')
      const reloaded = await testEntityManager.findOneOrFail(Segmentation, seg.id)
      expect(reloaded.name).toBe('fresh name')
    })

    it('rejects renaming a segment of another user\'s private job even for an editor', async() => {
      const otherUser = await createTestUser()
      const dataset = await createTestDataset()
      const job = await createJob(dataset.id, { isDefault: false, userId: otherUser.id })
      const seg = await createSeg(dataset.id, job.id, 'old')

      await expect(
        doQuery(updateSegmentationQuery, { id: seg.id, name: 'new' })
      ).rejects.toThrowError('You do not have permission to edit this segmentation')
      const reloaded = await testEntityManager.findOneOrFail(Segmentation, seg.id)
      expect(reloaded.name).toBe('old')
    })

    it('lets an editor rename a default segment and rejects a viewer', async() => {
      const otherUser = await createTestUser()
      const dataset = await createTestDataset()
      const job = await createJob(dataset.id, { isDefault: true, userId: otherUser.id })
      const seg = await createSeg(dataset.id, job.id, 'old')

      asViewerOf(otherUser)
      await expect(
        doQuery(updateSegmentationQuery, { id: seg.id, name: 'new' })
      ).rejects.toThrowError('You do not have permission to edit this segmentation')

      mockEsConnector.esDatasetByID.mockImplementation(async(id) =>
        Promise.resolve({ _source: { ds_id: id, ds_submitter_id: testUser.id } } as any)
      )
      const result = await doQuery<{ id: string, name: string }>(updateSegmentationQuery, { id: seg.id, name: 'renamed' })
      expect(result.name).toBe('renamed')
    })

    it('rejects renaming a segment without a job even for an editor', async() => {
      const dataset = await createTestDataset()
      const seg = await createSeg(dataset.id, null, 'old')

      await expect(
        doQuery(updateSegmentationQuery, { id: seg.id, name: 'new' })
      ).rejects.toThrowError('You do not have permission to edit this segmentation')
    })
  })
})
