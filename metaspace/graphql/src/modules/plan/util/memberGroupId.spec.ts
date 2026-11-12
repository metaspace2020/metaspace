import {
  anonContext, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach, setupTestUsers, testUser, userContext,
} from '../../../tests/graphqlTestEnvironment'
import { createTestGroup, createTestUserGroup } from '../../../tests/testDataCreation'
import { UserGroupRoleOptions as UGRO } from '../../group/model'
import { UserGroupRole } from '../../../binding'
import { memberGroupId } from './memberGroupId'

describe('memberGroupId', () => {
  beforeAll(onBeforeAll); afterAll(onAfterAll)
  beforeEach(async() => { await onBeforeEach(); await setupTestUsers() })
  afterEach(onAfterEach)

  const makeGroup = async(role: UserGroupRole | null, primary = true) => {
    const g = await createTestGroup()
    if (role != null) await createTestUserGroup(testUser.id, g.id, role, primary)
    return g.id
  }

  it('returns the MEMBER group', async() => {
    const id = await makeGroup(UGRO.MEMBER)
    expect(await memberGroupId(userContext as any)).toEqual(id)
  })

  it('returns the GROUP_ADMIN group', async() => {
    const id = await makeGroup(UGRO.GROUP_ADMIN)
    expect(await memberGroupId(userContext as any)).toEqual(id)
  })

  it('prefers the primary group', async() => {
    await makeGroup(UGRO.MEMBER, false)
    const primary = await makeGroup(UGRO.MEMBER, true)
    expect(await memberGroupId(userContext as any)).toEqual(primary)
  })

  it('ignores INVITED and PENDING memberships', async() => {
    await makeGroup(UGRO.INVITED)
    await makeGroup(UGRO.PENDING)
    expect(await memberGroupId(userContext as any)).toBeUndefined()
  })

  it('returns undefined for users without a group', async() => {
    await makeGroup(null)
    expect(await memberGroupId(userContext as any)).toBeUndefined()
  })

  it('returns undefined for anonymous users', async() => {
    await makeGroup(UGRO.MEMBER)
    expect(await memberGroupId(anonContext as any)).toBeUndefined()
  })
})
