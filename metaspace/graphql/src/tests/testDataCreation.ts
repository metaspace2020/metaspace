import * as moment from 'moment'
import { User } from '../modules/user/model'
import { Credentials } from '../modules/auth/model'
import {
  adminContext,
  adminUser,
  anonContext,
  testEntityManager,
  testUser,
  userContext,
} from './graphqlTestEnvironment'
import {
  Project,
  UserProject as UserProjectModel,
  UserProjectRoleOptions as UPRO,
} from '../modules/project/model'
import { PublicationStatusOptions as PSO } from '../modules/project/Publishing'
import { PublicationStatus, UserGroupRole, UserProjectRole } from '../binding'
import { Dataset, DatasetProject } from '../modules/dataset/model'
import { EngineDataset } from '../modules/engine/model'
import { Group, UserGroup as UserGroupModel, UserGroupRoleOptions as UGRO } from '../modules/group/model'
import { MolecularDB } from '../modules/moldb/model'
import { Context } from '../context'
import { getContextForTest } from '../getContext'
import { isMemberOfGroup } from '../modules/dataset/operation/isMemberOfGroup'

export const createTestUser = async(user?: Partial<User>): Promise<User> => {
  return (await createTestUserWithCredentials(user))[0]
}

export const createTestUserWithCredentials = async(user?: Partial<User>): Promise<[User, Credentials]> => {
  const creds = (await testEntityManager.save(Credentials, {}, {})) as Credentials
  const userModel = await testEntityManager.save(User, {
    name: 'tester',
    role: 'user',
    credentialsId: creds.id,
    email: `${Math.random()}@example.com`,
    ...user,
  }) as User
  return [userModel, creds]
}

export const createTestGroup = async(group?: Partial<Group>): Promise<Group> => {
  const groupDefaultFields = {
    name: 'test group',
    shortName: 'tstgrp',
    isPublic: true,
  }
  return await testEntityManager.save(Group, { ...groupDefaultFields, ...group }) as Group
}

export const createTestUserGroup = async(userId: string, groupId: string, role: UserGroupRole | null,
  primary: boolean): Promise<UserGroupModel | null> => {
  if (role != null) {
    return await testEntityManager.save(UserGroupModel, { userId, groupId, role, primary }) as UserGroupModel
  } else {
    await testEntityManager.delete(UserGroupModel, { userId, groupId })
    return null
  }
}

export const createTestProject = async(project?: Partial<Project>): Promise<Project> => {
  const projectDefaultFields = {
    name: 'test project',
    isPublic: true,
    publicationStatus: PSO.UNPUBLISHED,
    // WORKAROUND: Jest considers moment instances different if they're created from a Date vs created by moment.utc()
    // due to the presence/absense of an internal `_i` property.
    // Create from a Date() instance here so that validateBackgroundData doesn't see an invisible difference between
    // the `createTestProject` return value and the retrieved results from the database.
    createdDT: moment.utc(moment.utc().toDate()),
  }
  return await testEntityManager.save(Project, { ...projectDefaultFields, ...project }) as Project
}

export const createTestUserProject = async(userId: string, projectId: string,
  role: UserProjectRole | null): Promise<UserProjectModel | null> => {
  if (role != null) {
    return await testEntityManager.save(UserProjectModel, { userId, projectId, role }) as UserProjectModel
  } else {
    await testEntityManager.delete(UserProjectModel, { userId, projectId })
    return null
  }
}

export const createTestProjectMember = async(projectOrId: string | { id: string },
  role: UserProjectRole = UPRO.MEMBER) => {
  const user = await createTestUser({ name: 'project member' })
  await testEntityManager.save(UserProjectModel, {
    userId: user.id,
    projectId: typeof projectOrId === 'string' ? projectOrId : projectOrId.id,
    role,
  })
  return user
}

const genDatasetId = () => {
  const randomUnixTime = 150e10 + Math.floor(Math.random() * 10e10)
  return moment(randomUnixTime).toISOString()
    .replace(/([\d-]+)T(\d+):(\d+):(\d+).*/, '$1_$2h$3m$4s')
}

const TEST_METADATA = {
  Data_Type: 'Imaging MS',
  Sample_Information: {
    Organism: 'Species',
    Organism_Part: 'Organ or organism part',
    Condition: 'E.g. wildtype, diseased',
    Sample_Growth_Conditions: 'E.g. intervention, treatment',
  },
  Sample_Preparation: {
    Sample_Stabilisation: 'Preservation method',
    Tissue_Modification: 'E.g. chemical modification',
    MALDI_Matrix: '2,5-dihydroxybenzoic acid (DHB)',
    MALDI_Matrix_Application: 'ImagePrep',
    Solvent: 'none',
  },
  MS_Analysis: {
    Polarity: 'Positive',
    Ionisation_Source: 'MALDI',
    Analyzer: 'Orbitrap',
    Detector_Resolving_Power: { mz: 400, Resolving_Power: 130000 },
    Pixel_Size: { Xaxis: 20, Yaxis: 40 },
  },
}

const TEST_DESCRIPTION = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test description 123' }] }],
})

export const createTestDatasetWithEngineDataset = async(
  dataset: Partial<Dataset> = {}, engineDataset: Partial<EngineDataset> = {}
): Promise<{dataset: Dataset, engineDataset: EngineDataset}> => {
  const datasetId = engineDataset.id || genDatasetId()
  const userId = 'userId' in dataset ? dataset.userId : userContext.getUserIdOrFail()
  const groupApproved = dataset.groupId && userId && !('groupApproved' in dataset)
    ? await isMemberOfGroup(testEntityManager, userId, dataset.groupId)
    : false

  const datasetPromise = testEntityManager.save(Dataset, {
    id: datasetId,
    userId,
    description: TEST_DESCRIPTION,
    groupApproved,
    ...dataset,
  })

  const engineDsModel = await testEntityManager.save(EngineDataset, {
    id: datasetId,
    name: 'test dataset',
    uploadDt: moment.utc(),
    statusUpdateDt: moment.utc(),
    metadata: TEST_METADATA,
    status: 'FINISHED',
    isPublic: true,
    ...engineDataset,
  }) as EngineDataset

  return { dataset: (await datasetPromise) as Dataset, engineDataset: engineDsModel }
}

export const createTestDataset = async(
  dataset: Partial<Dataset> = {}, engineDataset: Partial<EngineDataset> = {}
): Promise<Dataset> => {
  return (await createTestDatasetWithEngineDataset(dataset, engineDataset)).dataset
}
export const createTestDatasetProject = async(
  projectId: string, datasetId: string, approved = true
): Promise<DatasetProject> => {
  return await testEntityManager.save(DatasetProject, { projectId, datasetId, approved }) as DatasetProject
}

export const createTestDatasetAndProject = async(publicationStatus: PublicationStatus): Promise<DatasetProject> => {
  const dataset = await createTestDataset()
  const project = await createTestProject({ publicationStatus })
  return await createTestDatasetProject(project.id, dataset.id)
}

export const createTestMolecularDB = async(molecularDb: Partial<MolecularDB> = {}): Promise<MolecularDB> => {
  return await testEntityManager.save(MolecularDB, {
    name: 'test-db',
    version: 'db-version',
    isPublic: false,
    archived: false,
    fullName: 'Full database name',
    description: 'Database description',
    link: 'http://example.org',
    citation: 'citation string',
    createdDT: moment.utc(),
    ...molecularDb,
  }) as MolecularDB
}

export const TestUserScenarioOptions = {
  currentUser: 'currentUser',
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
  if (scenario === 'currentUser') {
    return { otherUser: testUser, context: userContext }
  } if (scenario === 'admin') {
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
      (await createTestUserGroup(otherUser.id, (otherGroup ?? group).id, OtherUserRole[scenario], true))!
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
