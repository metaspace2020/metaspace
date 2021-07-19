import { EntityManager } from 'typeorm'
import { ContextUser } from '../../../context'
import logger from '../../../utils/logger'
import { getDatasetForEditing } from './getDatasetForEditing'
import { Dataset as DatasetModel, DatasetProject as DatasetProjectModel } from '../model'
import { DeleteDatasetArgs, smApiDeleteDataset } from '../../../utils/smApi/datasets'

export const deleteDataset = async(entityManager: EntityManager, user: ContextUser, datasetId: string,
  args?: DeleteDatasetArgs) => {
  logger.info(`User '${user.id}' deleting '${datasetId}' dataset...`)
  if (user.role !== 'admin') {
    // Skip this for admins so that datasets that are missing their graphql.dataset record can still be deleted
    await getDatasetForEditing(entityManager, user, datasetId, { delete: true })
  }

  await entityManager.getRepository(DatasetProjectModel).delete({ datasetId: datasetId })
  await entityManager.getRepository(DatasetModel).delete(datasetId)
  const resp = await smApiDeleteDataset(datasetId, args)

  logger.info(`Dataset '${datasetId}' was deleted (sm-api returned ${JSON.stringify(resp)})`)
  return resp
}
