import { UserGroupRole, UserProjectRole } from '../binding'
import { Group, UserGroup as UserGroupModel, UserGroupRoleOptions as UGRO } from '../modules/group/model'
import { Project, UserProjectRoleOptions as UPRO } from '../modules/project/model'
import {
  adminContext,
  adminUser,
  anonContext,
  testEntityManager,
  testUser,
  userContext,
} from './graphqlTestEnvironment'
import { User } from '../modules/user/model'
import { getContextForTest } from '../getContext'
import { Context } from '../context'
import {
  createTestGroup,
  createTestProject,
  createTestUser,
  createTestUserGroup,
  createTestUserProject,
} from './testDataCreation'

export const TestUserScenarioOptions = {
  sameUser: 'sameUser',
  unrelatedUser: 'unrelatedUser',
  admin: 'admin',
  anon: 'anon',
  sameGroupInvited: 'sameGroupInvited',
  sameGroupPending: 'sameGroupPending',
  sameGroupMember: 'sameGroupMember',
  sameGroupAdmin: 'sameGroupAdmin',
  differentGroupAdmin: 'differentGroupAdmin',
  pendingGroupAdmin: 'pendingGroupAdmin',
  invitedGroupAdmin: 'invitedGroupAdmin',
  sameProjectInvited: 'sameProjectInvited',
  sameProjectPending: 'sameProjectPending',
  sameProjectMember: 'sameProjectMember',
  sameProjectManager: 'sameProjectManager',
  sameProjectReviewer: 'sameProjectReviewer',
  differentProjectManager: 'differentProjectManager',
  pendingProjectManager: 'pendingGroupManager',
  pendingProjectReviewer: 'pendingGroupReviewer',
  invitedProjectManager: 'invitedGroupManager',
} as const
export type TestUserScenario = keyof typeof TestUserScenarioOptions

export interface TestUserForScenarioResult {
  // otherUser - the user created for the scenario. In contrast to "thisUser"/testUser - the user owning the securable
  otherUser: User | null
  context: Context
  // groupId - for sameGroup* this is the groupId of both users, for differentGroup* this is the groupId of `userContext`
  groupId?: string
  // otherGroupId - for differentGroup* this is the groupId of the created user
  otherGroupId?: string
  projectId?: string
  otherProjectId?: string
}

/**
 * For testing permissions. Creates `otherUser` that is related to the global `testUser` based on `scenario`
 * @param scenario
 */
export const getTestUserForScenario = async(scenario: TestUserScenario): Promise<TestUserForScenarioResult> => {
  const ThisUserGroupRole: Partial<Record<TestUserScenario, UserGroupRole>> = {
    pendingGroupAdmin: UGRO.PENDING,
    invitedGroupAdmin: UGRO.INVITED,
  }
  const ThisUserProjectRole: Partial<Record<TestUserScenario, UserProjectRole>> = {
    pendingProjectManager: UPRO.PENDING,
    pendingProjectReviewer: UPRO.PENDING,
    invitedProjectManager: UPRO.INVITED,
  }
  const OtherUserRole = {
    sameGroupInvited: UGRO.INVITED,
    sameGroupPending: UGRO.PENDING,
    sameGroupMember: UGRO.MEMBER,
    sameGroupAdmin: UGRO.GROUP_ADMIN,
    differentGroupAdmin: UGRO.GROUP_ADMIN,
    pendingGroupAdmin: UGRO.GROUP_ADMIN,
    invitedGroupAdmin: UGRO.GROUP_ADMIN,
    sameProjectInvited: UPRO.INVITED,
    sameProjectPending: UPRO.PENDING,
    sameProjectMember: UPRO.MEMBER,
    sameProjectManager: UPRO.MANAGER,
    sameProjectReviewer: UPRO.REVIEWER,
    differentProjectManager: UPRO.MANAGER,
    pendingProjectManager: UPRO.MANAGER,
    pendingProjectReviewer: UPRO.REVIEWER,
    invitedProjectManager: UPRO.MANAGER,
  } as const

  // Special cases where the context is overridden or already exists
  if (scenario === 'sameUser') {
    return { otherUser: testUser, context: userContext }
  }
  if (scenario === 'admin') {
    return { otherUser: adminUser, context: adminContext }
  } else if (scenario === 'anon') {
    return { otherUser: null, context: anonContext }
  }

  // Cases where a new user is created
  let otherUser: User
  let group: Group | undefined
  const otherUserGroups: UserGroupModel[] = []
  let otherGroup: Group | undefined
  let project: Project | undefined
  let otherProject: Project | undefined
  if (scenario === 'unrelatedUser') {
    otherUser = await createTestUser()
  } else if (
    scenario === 'sameGroupInvited'
    || scenario === 'sameGroupPending'
    || scenario === 'sameGroupMember'
    || scenario === 'sameGroupAdmin'
    || scenario === 'differentGroupAdmin'
    || scenario === 'pendingGroupAdmin'
    || scenario === 'invitedGroupAdmin'
  ) {
    otherUser = await createTestUser()
    group = await createTestGroup()
    if (scenario === 'differentGroupAdmin') {
      otherGroup = await createTestGroup({ name: 'other group' })
    }
    await createTestUserGroup(testUser.id, group.id, ThisUserGroupRole[scenario] ?? UGRO.MEMBER, true)
    otherUserGroups.push(
      (await createTestUserGroup(otherUser.id, (otherGroup ?? group).id, OtherUserRole[scenario], true))!,
    )
  } else if (
    scenario === 'sameProjectInvited'
    || scenario === 'sameProjectPending'
    || scenario === 'sameProjectMember'
    || scenario === 'sameProjectManager'
    || scenario === 'sameProjectReviewer'
    || scenario === 'differentProjectManager'
    || scenario === 'pendingProjectManager'
    || scenario === 'pendingProjectReviewer'
    || scenario === 'invitedProjectManager'
  ) {
    otherUser = await createTestUser()
    project = await createTestProject()
    if (scenario === 'differentProjectManager') {
      otherProject = await createTestProject({ name: 'other group' })
    }
    await createTestUserProject(testUser.id, project.id, ThisUserProjectRole[scenario] ?? UPRO.MEMBER)
    await createTestUserProject(otherUser.id, (otherProject ?? project).id, OtherUserRole[scenario])
  } else {
    throw new Error(`Unhandled scenario in call getTestUserForScenario(${scenario})`)
  }

  return {
    otherUser,
    context: getContextForTest({ ...otherUser, groups: otherUserGroups }, testEntityManager),
    groupId: group?.id,
    otherGroupId: otherGroup?.id,
    projectId: project?.id,
    otherProjectId: otherProject?.id,
  }
}

/**
 * Makes a list of [[scenario, val], [scenario, val], ...] for use with test.each()
 * @param defaultVal    The value of all unspecified scenarios
 * @param overrides     The value of specific scenarios that should be overridden
 */
export const allScenarioTestCases = <T>(
  defaultVal: T, overrides: Partial<Record<TestUserScenario, T>>
): ([TestUserScenario, T])[] =>
    (Object.keys(TestUserScenarioOptions) as TestUserScenario[])
      .map(option => ([option, option in overrides ? overrides[option]! : defaultVal]))
