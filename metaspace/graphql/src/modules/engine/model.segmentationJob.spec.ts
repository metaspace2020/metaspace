import {
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser,
} from '../../tests/graphqlTestEnvironment'
import { createTestDataset, createTestUser } from '../../tests/testDataCreation'
import { ImageSegmentationJob, Segmentation } from './model'
import { User } from '../user/model'

describe('ImageSegmentationJob entity', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
  })
  afterEach(onAfterEach)

  it('stores ownership and result columns on image_segmentation_job', async() => {
    const ds = await createTestDataset()
    const job = await testEntityManager.save(ImageSegmentationJob, {
      datasetId: ds.id,
      status: 'FINISHED',
      userId: testUser.id,
      isDefault: false,
      result: { n_segments: 2 },
      labelMapImageId: 'img1',
      labelMapImageUrl: 'http://x/img1',
    } as Partial<ImageSegmentationJob>)
    const reloaded = await testEntityManager.findOneOrFail(ImageSegmentationJob, job.id)
    expect(reloaded).toMatchObject({
      userId: testUser.id,
      isDefault: false,
      result: { n_segments: 2 },
      labelMapImageId: 'img1',
      labelMapImageUrl: 'http://x/img1',
    })
  })

  it('defaults isDefault to true when not given', async() => {
    const ds = await createTestDataset()
    const job = await testEntityManager.save(ImageSegmentationJob, { datasetId: ds.id, status: 'QUEUED' } as Partial<ImageSegmentationJob>)
    const reloaded = await testEntityManager.findOneOrFail(ImageSegmentationJob, job.id)
    expect(reloaded.isDefault).toBe(true)
    expect(reloaded.userId).toBeNull()
  })

  it('rejects a userId that is not a user', async() => {
    const ds = await createTestDataset()
    await expect(testEntityManager.save(ImageSegmentationJob, {
      datasetId: ds.id, status: 'QUEUED', userId: '00000000-0000-0000-0000-000000000000',
    } as Partial<ImageSegmentationJob>)).rejects.toThrow(/foreign key/)
  })

  it('deleting the owner keeps the job and clears userId', async() => {
    const owner = await createTestUser()
    const ds = await createTestDataset()
    const job = await testEntityManager.save(ImageSegmentationJob, {
      datasetId: ds.id, status: 'FINISHED', userId: owner.id, isDefault: true,
    } as Partial<ImageSegmentationJob>)
    await testEntityManager.delete(User, owner.id)
    const reloaded = await testEntityManager.findOneOrFail(ImageSegmentationJob, job.id)
    expect(reloaded.userId).toBeNull()
    expect(reloaded.isDefault).toBe(true)
  })

  it('deleting a job cascades to its segments', async() => {
    const ds = await createTestDataset()
    const job = await testEntityManager.save(
      ImageSegmentationJob, { datasetId: ds.id, status: 'FINISHED' } as Partial<ImageSegmentationJob>
    )
    const seg = await testEntityManager.save(Segmentation, {
      datasetId: ds.id, jobId: job.id, segmentIndex: 0, algorithm: 'kmeans', status: 'FINISHED',
    } as Partial<Segmentation>)
    await testEntityManager.delete(ImageSegmentationJob, job.id)
    const found = await testEntityManager.findOne(Segmentation, seg.id)
    expect(found).toBeUndefined()
  })
})
