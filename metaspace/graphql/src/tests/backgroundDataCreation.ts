import * as _ from 'lodash'
import { createTestDataset, createTestProject, createTestUserWithCredentials } from './testDataCreation'
import { testEntityManager } from './graphqlTestEnvironment'
import { Project, UserProject, UserProjectRoleOptions as UPRO } from '../modules/project/model'
import { UserProjectRole } from '../binding'
import { User } from '../modules/user/model'
import { Dataset, DatasetProject } from '../modules/dataset/model'
import { Credentials } from '../modules/auth/model'

interface BackgroundDataOptions {
  // Set these flags to true to create independent data that is probably unrelated to the data being tested
  // If multiple types are selected, relationships are automatically created between them
  users?: boolean;
  projects?: boolean;
  datasets?: boolean;
  // Populate these arrays with IDs to create data that is linked to the data being tested
  membersForProjectIds?: string[];
  projectsForUserIds?: string[];
  datasetsForUserIds?: string[];
  datasetsForProjectIds?: string[];
}

export interface BackgroundData {
  users: User[];
  credentials: Credentials[];
  projects: Project[];
  datasets: Dataset[];
  userProjects: UserProject[];
  datasetProjects: DatasetProject[];
}

/**
 * Creates a bunch of data that shouldn't be affected by the test. `validateBackgroundData` can later be used to verify
 * that the data hasn't changed
 */
export const createBackgroundData = async(options: BackgroundDataOptions): Promise<BackgroundData> => {
  const {
    projects = false, users = false, datasets = false,
    membersForProjectIds = [], projectsForUserIds = [], datasetsForUserIds = [], datasetsForProjectIds = [],
  } = _.cloneDeep(options)
  const UPRORoles = Object.keys(UPRO) as UserProjectRole[]

  const allUsers = [] as Promise<User>[]
  const allCredentials = [] as Promise<Credentials>[]
  const allProjects = [] as Promise<Project>[]
  const allDatasets = [] as Promise<Dataset>[]
  const allUserProjects = [] as Promise<UserProject>[]
  const allDatasetProjects = [] as Promise<DatasetProject>[]

  // Create "independent" data
  const indUserCreds = users || datasets || datasetsForProjectIds
    ? UPRORoles.map(role => createTestUserWithCredentials({ name: `Independent User ${role}` }))
    : []
  const indUsers = indUserCreds.map(async u => (await u)[0])
  allUsers.push(...indUsers)
  allCredentials.push(...indUserCreds.map(async u => (await u)[1]))
  const indProjects = projects
    ? [true, false].map((isPublic, i) => createTestProject({ name: `Independent Project ${i}`, isPublic }))
    : []
  allProjects.push(...indProjects)
  const indDatasets = datasets
    ? [true, false, true, false].map(async(isPublic, i) => { // doubled so that both approved & non-approved datasetProjects can be made
        const dataset = { userId: (await indUsers[i]).id }
        return createTestDataset(dataset, { name: `Independent Dataset ${i}`, isPublic })
      })
    : []
  allDatasets.push(...indDatasets)

  // Create relations between independent data
  if (users && projects) {
    const indUserProjects = _.flatMap(indProjects, project => {
      return UPRORoles.map(async(role, idx) => {
        const projectId = (await project).id
        const userId = (await indUsers[idx]).id
        return await testEntityManager.save(UserProject, { userId, projectId, role }) as UserProject
      })
    })
    allUserProjects.push(...indUserProjects)
  }
  if (projects && datasets) {
    const indDatasetProjects = _.flatMap(indProjects, (project, idx) => {
      return indDatasets.map(async dataset => {
        const projectId = (await project).id
        const datasetId = (await dataset).id
        return await testEntityManager.save(DatasetProject,
          { projectId, datasetId, approved: idx % 4 < 2 }) as any as DatasetProject
      })
    })
    allDatasetProjects.push(...indDatasetProjects)
  }

  // Create "dependent" data
  const membersForProjects = _.flatMap(membersForProjectIds, projectId => {
    return UPRORoles.map(async role => {
      const [user, credentials] = await createTestUserWithCredentials({ name: `${role} for project ${projectId}` })
      const userProject = await testEntityManager.save(UserProject, { userId: user.id, projectId, role }) as UserProject
      return { user, credentials, userProject }
    })
  })
  allUsers.push(...membersForProjects.map(async m => (await m).user))
  allCredentials.push(...membersForProjects.map(async m => (await m).credentials))
  allUserProjects.push(...membersForProjects.map(async m => (await m).userProject))

  const projectsForUsers = _.flatMap(projectsForUserIds, userId => {
    return UPRORoles.map(async role => {
      const project = await createTestProject({ name: `${role} project for user ${userId}` })
      const userProject = await testEntityManager.save(UserProject, {
        userId,
        projectId: project.id,
        role,
      }) as UserProject
      return { project, userProject }
    })
  })
  allProjects.push(...projectsForUsers.map(async m => (await m).project))
  allUserProjects.push(...projectsForUsers.map(async m => (await m).userProject))

  const datasetsForUsers = _.flatMap(datasetsForUserIds, userId => {
    return [true, false].map(async isPublic => {
      return createTestDataset({ userId }, { name: `Dataset for user ${userId} ${isPublic}`, isPublic })
    })
  })
  allDatasets.push(...datasetsForUsers)

  const datasetsForProjects = _.flatMap(datasetsForProjectIds, projectId => {
    return [[true, true], [true, false], [false, true], [false, false]]
      .map(async([isPublic, approved], idx) => {
        const userId = (await indUsers[idx % indUsers.length]).id
        const dataset = await createTestDataset({ userId }, {
          name: `Dataset for project ${projectId} ${isPublic} ${approved}`,
          isPublic,
        })
        const datasetProject = await testEntityManager.save(DatasetProject, {
          datasetId: dataset.id,
          projectId,
          approved,
        }) as any as DatasetProject
        return { dataset, datasetProject }
      })
  })
  allDatasets.push(...datasetsForProjects.map(async m => (await m).dataset))
  allDatasetProjects.push(...datasetsForProjects.map(async m => (await m).datasetProject))

  return {
    users: await Promise.all(allUsers),
    credentials: await Promise.all(allCredentials),
    projects: await Promise.all(allProjects),
    datasets: await Promise.all(allDatasets),
    userProjects: await Promise.all(allUserProjects),
    datasetProjects: await Promise.all(allDatasetProjects),
  }
}

export const validateBackgroundData = async(expected: BackgroundData) => {
  const usersPromise = testEntityManager.findByIds(User, expected.users.map(u => u.id))
  const credentialsPromise = testEntityManager.findByIds(Credentials, expected.credentials.map(u => u.id))
  const projectsPromise = testEntityManager.findByIds(Project, expected.projects.map(p => p.id))
  const datasetsPromise = testEntityManager.findByIds(Dataset, expected.datasets.map(d => d.id))
  const userProjectsPromise = testEntityManager.findByIds(
    UserProject,
    expected.userProjects.map(({ userId, projectId }) => ({ userId, projectId }))
  )
  const datasetProjectsPromise = testEntityManager.findByIds(
    DatasetProject,
    expected.datasetProjects.map(({ datasetId, projectId }) => ({ datasetId, projectId }))
  )
  const users = await usersPromise
  const credentials = await credentialsPromise
  const projects = await projectsPromise
  const datasets = await datasetsPromise
  const userProjects = await userProjectsPromise
  const datasetProjects = await datasetProjectsPromise

  expect(_.sortBy(users, ['id'])).toEqual(_.sortBy(expected.users, ['id']))
  expect(_.sortBy(credentials, ['id'])).toEqual(_.sortBy(expected.credentials, ['id']))
  expect(_.sortBy(projects, ['id'])).toEqual(_.sortBy(expected.projects, ['id']))
  expect(_.sortBy(datasets, ['id'])).toEqual(_.sortBy(expected.datasets, ['id']))
  expect(_.sortBy(userProjects, ['userId', 'projectId']))
    .toEqual(_.sortBy(expected.userProjects, ['userId', 'projectId']))
  expect(_.sortBy(datasetProjects, ['datasetId', 'projectId']))
    .toEqual(_.sortBy(expected.datasetProjects, ['datasetId', 'projectId']))
}
