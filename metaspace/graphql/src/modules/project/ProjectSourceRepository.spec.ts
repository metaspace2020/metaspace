import { createTestDataset, createTestProject } from '../../tests/testDataCreation'
import { DatasetProject as DatasetProjectModel } from '../dataset/model'
import { UserProject as UserProjectModel, UserProjectRoleOptions as UPRO } from './model'
import {
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser, userContext,
} from '../../tests/graphqlTestEnvironment'
import { createBackgroundData } from '../../tests/backgroundDataCreation'
import { ProjectSourceRepository } from './ProjectSourceRepository'

describe('modules/project/ProjectSourceRepository', () => {
  let userId: string

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    userId = testUser.id
  })
  afterEach(onAfterEach)

  describe('findProjectsByDatasetId', () => {
    it('should only find project IDs for the specific dataset', async() => {
      const dataset = await createTestDataset()
      const project = await createTestProject()
      await testEntityManager.save(DatasetProjectModel, { dataset, project, approved: false })
      await testEntityManager.save(UserProjectModel, { userId, project, role: UPRO.MEMBER })
      await createBackgroundData({
        datasets: true,
        projects: true,
        datasetsForUserIds: [userId],
        projectsForUserIds: [userId],
        datasetsForProjectIds: [project.id],
      })

      const result = await testEntityManager.getCustomRepository(ProjectSourceRepository)
        .findProjectsByDatasetId(userContext, dataset.id)

      expect(result).toEqual([
        expect.objectContaining({ id: project.id }),
      ])
    })

    it('should not find project IDs if the user is not a member of that project', async() => {
      const dataset = await createTestDataset()
      const project1 = await createTestProject()
      const project2 = await createTestProject()
      await testEntityManager.save(DatasetProjectModel, { dataset, project: project1, approved: false })
      await testEntityManager.save(DatasetProjectModel, { dataset, project: project2, approved: false })
      await testEntityManager.save(UserProjectModel, { userId, project: project1, role: UPRO.MEMBER })

      const result = await testEntityManager.getCustomRepository(ProjectSourceRepository)
        .findProjectsByDatasetId(userContext, dataset.id)

      expect(result).toEqual([
        expect.objectContaining({ id: project1.id }),
      ])
    })
  })
})
