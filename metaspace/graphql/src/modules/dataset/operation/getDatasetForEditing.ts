import { EntityManager } from 'typeorm'
import { ContextUser } from '../../../context'
import { UserError } from 'graphql-errors'
import { Dataset as DatasetModel, DatasetProject } from '../model'
import { getCurrentUserGroupRolesUncached } from '../../group/util/getCurrentUserGroupRoles'
import { UserGroupRoleOptions as UGRO } from '../../group/model'
import { checkProjectsPublicationStatus } from './publicationChecks'
import { PublicationStatusOptions as PSO } from '../../project/Publishing'
import { UserProjectRoleOptions as UPRO } from '../../project/model'

export interface RequestedAccess {
  // edit - modify metadata, reprocess, add to groups/projects, and all other permissions not specified below
  edit?: boolean

  delete?: boolean
  // removeFromProjectId - remove the dataset from a specific project (value should be projectId)
  removeFromProjectId?: string
}

export const getDatasetForEditing = async(
  entityManager: EntityManager, user: ContextUser, dsId: string, requestedAccess: RequestedAccess = { edit: true },
) => {
  if (!user.id) {
    throw new UserError('Access denied')
  }

  if (!dsId) {
    throw new UserError('Dataset id not provided')
  }

  const dataset = await entityManager.getRepository(DatasetModel).findOne({
    id: dsId,
  })
  if (!dataset) {
    throw new UserError(`Dataset ${dsId} does not exist`)
  }

  const isSubmitter = user.id === dataset.userId
  const isAdmin = user.role === 'admin'
  const isInSameGroup = dataset.groupId != null && (await user.getMemberOfGroupIds()).includes(dataset.groupId)

  if (requestedAccess.edit) {
    // Only submitters, admins and other group members may directly edit a dataset
    if (!isSubmitter && !isAdmin && !isInSameGroup) {
      throw new UserError('Access denied')
    }
  }

  if (requestedAccess.delete) {
    // Non-admins cannot delete published datasets
    if (!isAdmin) {
      await checkProjectsPublicationStatus(
        entityManager, dsId, [PSO.UNDER_REVIEW, PSO.PUBLISHED]
      )
    }

    // Allow group admins but not other group members to delete
    if (!isSubmitter && !isAdmin) {
      const userGroupRoles = await getCurrentUserGroupRolesUncached(entityManager, user)
      if (dataset.groupId == null || userGroupRoles[dataset.groupId] !== UGRO.GROUP_ADMIN) {
        throw new UserError('Access denied')
      }
    }
  }

  if (requestedAccess.removeFromProjectId != null) {
    // Anyone with edit rights, or the manager of the project may remove datasets
    const userProjectRole = (await user.getProjectRoles())[requestedAccess.removeFromProjectId]
    const isManager = userProjectRole === UPRO.MANAGER

    if (!isSubmitter && !isAdmin && !isInSameGroup && !isManager) {
      throw new UserError('Access denied')
    }

    // do not allow removal of datasets that are not from project
    const dsProject = await entityManager.getRepository(DatasetProject).findOne({
      datasetId: dsId,
      projectId: requestedAccess.removeFromProjectId,
    })

    if (!dsProject) {
      throw new UserError('Dataset is not in project')
    }
  }

  return dataset
}
