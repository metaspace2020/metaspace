import * as moment from 'moment'
import { User } from '../modules/user/model'
import { Credentials } from '../modules/auth/model'
import { testEntityManager, userContext } from './graphqlTestEnvironment'
import { Project, UserProject as UserProjectModel, UserProjectRoleOptions as UPRO } from '../modules/project/model'
import { PublicationStatusOptions as PSO } from '../modules/project/Publishing'
import { PublicationStatus, UserGroupRole, UserProjectRole } from '../binding'
import { Dataset, DatasetProject } from '../modules/dataset/model'
import { DatasetDiagnostic, EngineDataset, Job } from '../modules/engine/model'
import { Group, UserGroup as UserGroupModel } from '../modules/group/model'
import { MolecularDB } from '../modules/moldb/model'
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

type RequiredJobFields = Pick<Job, 'datasetId' | 'moldbId'>
export const createTestJob = async(job: RequiredJobFields & Partial<Job>): Promise<Job> => {
  return (await testEntityManager.save(Job, {
    status: 'FINISHED',
    start: moment.utc(),
    finish: moment.utc(),
    ...job,
  })) as Job
}

export const createTestDatasetDiagnostic = async(
  diag: Pick<DatasetDiagnostic, 'datasetId'> & Partial<DatasetDiagnostic>
): Promise<DatasetDiagnostic> => {
  const result = await testEntityManager.save(DatasetDiagnostic, {
    type: 'TIC',
    data: { min_tic: 2332547584.0, max_tic: 24486256640.0, sum_tic: 4962219196416.0, is_from_metadata: false },
    images: [{ key: 'TIC', image_id: 'test_image_id', url: 'test_image_url', format: 'NPY' }],
    ...diag,
  })
  return result as unknown as DatasetDiagnostic
}
