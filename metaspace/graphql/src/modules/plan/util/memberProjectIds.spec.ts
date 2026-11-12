import {
  anonContext, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach, setupTestUsers, testUser, userContext,
} from '../../../tests/graphqlTestEnvironment'
import { createTestProject, createTestUserProject } from '../../../tests/testDataCreation'
import { UserProjectRoleOptions as UPRO } from '../../project/model'
import { UserProjectRole } from '../../../binding'
import { memberProjectIds } from './memberProjectIds'

describe('memberProjectIds', () => {
  beforeAll(onBeforeAll); afterAll(onAfterAll)
  beforeEach(async() => { await onBeforeEach(); await setupTestUsers() })
  afterEach(onAfterEach)

  const makeProject = async(role: UserProjectRole | null) => {
    const p = await createTestProject({ name: 'P', isPublic: false })
    if (role != null) await createTestUserProject(testUser.id, p.id, role)
    return p.id
  }

  it('keeps MEMBER projects', async() => {
    const id = await makeProject(UPRO.MEMBER)
    expect(await memberProjectIds(userContext as any, [id])).toEqual([id])
  })

  it('keeps MANAGER projects', async() => {
    const id = await makeProject(UPRO.MANAGER)
    expect(await memberProjectIds(userContext as any, [id])).toEqual([id])
  })

  it('drops REVIEWER projects', async() => {
    const id = await makeProject(UPRO.REVIEWER)
    expect(await memberProjectIds(userContext as any, [id])).toEqual([])
  })

  it('drops projects the user does not belong to', async() => {
    const id = await makeProject(null)
    expect(await memberProjectIds(userContext as any, [id])).toEqual([])
  })

  it('dedupes and preserves original order', async() => {
    const a = await makeProject(UPRO.MEMBER)
    const b = await makeProject(UPRO.MANAGER)
    expect(await memberProjectIds(userContext as any, [b, a, b, a])).toEqual([b, a])
  })

  it('returns [] for undefined input', async() => {
    expect(await memberProjectIds(userContext as any, undefined)).toEqual([])
  })

  it('returns [] for anonymous users', async() => {
    const id = await makeProject(UPRO.MEMBER)
    expect(await memberProjectIds(anonContext as any, [id])).toEqual([])
  })
})
