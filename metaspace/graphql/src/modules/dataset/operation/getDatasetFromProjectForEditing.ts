import { EntityManager } from 'typeorm'
import { ContextUser } from '../../../context'
import { UserError } from 'graphql-errors'
import { Dataset as DatasetModel, DatasetProject } from '../model'

export const getDatasetFromProjectForEditing = async(entityManager: EntityManager,
  user: ContextUser, dsId: string, projectId: string, userProjectRole: string, isForRemoval: boolean) => {
  if (!user.id) {
    throw new UserError('Access denied')
  }

  if (!dsId) {
    throw new UserError('Dataset id not provided')
  }

  if (!projectId) {
    throw new UserError('Project id not provided')
  }

  const dataset = await entityManager.getRepository(DatasetModel).findOne({
    id: dsId,
  })
  if (!dataset) {
    throw new UserError(`Dataset ${dsId} does not exist`)
  }

  if (userProjectRole !== 'MANAGER' && user.id !== dataset.userId && user.role !== 'admin') {
    throw new UserError('Access denied')
  }

  // do not allow managers to add datasets that they do not own
  if (!isForRemoval && userProjectRole === 'MANAGER' && user.id !== dataset.userId && user.role !== 'admin') {
    throw new UserError('Access denied')
  }

  if (isForRemoval) { // do not allow removal of datasets that are not from project
    const dsProject = await entityManager.getRepository(DatasetProject).findOne({
      datasetId: dsId,
      projectId: projectId,
    })

    if (!dsProject) {
      throw new UserError('Access denied')
    }
  }

  return dataset
}
