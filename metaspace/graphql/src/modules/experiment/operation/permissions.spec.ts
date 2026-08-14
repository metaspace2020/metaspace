import {
  onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testEntityManager, testUser, userContext,
} from '../../../tests/graphqlTestEnvironment'
import { UserProject, UserProjectRoleOptions as UPRO } from '../../project/model'
import { createTestProject } from '../../../tests/testDataCreation'
import { assertCanAccessProject } from './permissions'

describe('experiment permissions', () => {
  beforeAll(onBeforeAll); afterAll(onAfterAll)
  beforeEach(async() => { await onBeforeEach(); await setupTestUsers() })
  afterEach(onAfterEach)

  const makeProject = async() => {
    return await createTestProject({ name: 'P', isPublic: false })
  }

  it('rejects non-members', async() => {
    const p = await makeProject()
    await expect(assertCanAccessProject(userContext as any, p.id, { write: false }))
      .rejects.toThrow(/Not authorized/)
  })

  it('rejects reviewers for write ops', async() => {
    const p = await makeProject()
    await testEntityManager.save(UserProject, { userId: testUser.id, projectId: p.id, role: UPRO.REVIEWER } as any)
    await expect(assertCanAccessProject(userContext as any, p.id, { write: true }))
      .rejects.toThrow(/Not authorized/)
  })

  it('allows members for read and write', async() => {
    const p = await makeProject()
    await testEntityManager.save(UserProject, { userId: testUser.id, projectId: p.id, role: UPRO.MEMBER } as any)
    await expect(assertCanAccessProject(userContext as any, p.id, { write: true })).resolves.toBeUndefined()
    await expect(assertCanAccessProject(userContext as any, p.id, { write: false })).resolves.toBeUndefined()
  })
})
