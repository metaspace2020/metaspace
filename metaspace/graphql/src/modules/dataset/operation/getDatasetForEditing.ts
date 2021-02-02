import { EntityManager } from 'typeorm'
import { ContextUser } from '../../../context'
import { UserError } from 'graphql-errors'
import { Dataset as DatasetModel } from '../model'

export const getDatasetForEditing = async(entityManager: EntityManager, user: ContextUser, dsId: string) => {
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

  if (user.id !== dataset.userId && user.role !== 'admin') {
    throw new UserError('Access denied')
  }

  return dataset
}
