import {
  adminContext, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testUser, userContext,
} from '../../../tests/graphqlTestEnvironment'
import { UserProjectRoleOptions as UPRO } from '../../project/model'
import { createTestProject, createTestUserProject } from '../../../tests/testDataCreation'
import { assertProjectManager } from './assertProjectManager'

describe('assertProjectManager', () => {
  beforeAll(onBeforeAll); afterAll(onAfterAll)
  beforeEach(async() => { await onBeforeEach(); await setupTestUsers() })
  afterEach(onAfterEach)

  it('rejects non-members', async() => {
    const p = await createTestProject({ isPublic: false })
    await expect(assertProjectManager(userContext, p.id)).rejects.toThrow(/Unauthorized/)
  })

  it('rejects members who are not managers', async() => {
    const p = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, p.id, UPRO.MEMBER)
    await expect(assertProjectManager(userContext, p.id)).rejects.toThrow(/Unauthorized/)
  })

  it('allows managers', async() => {
    const p = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, p.id, UPRO.MANAGER)
    await expect(assertProjectManager(userContext, p.id)).resolves.toBeUndefined()
  })

  it('allows admins', async() => {
    const p = await createTestProject({ isPublic: false })
    await expect(assertProjectManager(adminContext, p.id)).resolves.toBeUndefined()
  })
})
