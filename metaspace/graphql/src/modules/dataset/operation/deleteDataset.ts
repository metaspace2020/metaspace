import {Connection, EntityManager} from 'typeorm';
import {ContextUser} from '../../../context';
import {logger} from '../../../../utils';
import {getDatasetForEditing} from './getDatasetForEditing';
import {smAPIRequest} from '../../../utils';
import {Dataset as DatasetModel, DatasetProject as DatasetProjectModel} from '../model';

export const deleteDataset = async (connection: Connection | EntityManager, user: ContextUser, dsId: string) => {
  logger.info(`User '${user.id}' deleting '${dsId}' dataset...`);
  if (user.role !== 'admin') {
    // Skip this for admins so that datasets that are missing their graphql.dataset record can still be deleted
    await getDatasetForEditing(connection, user, dsId);
  }

  try {
    await smAPIRequest(`/v1/datasets/${dsId}/del-optical-image`, {});
  }
  catch (err) {
    logger.warn(err);
  }

  await connection.getRepository(DatasetProjectModel).delete({ datasetId: dsId });
  await connection.getRepository(DatasetModel).delete(dsId);
  const resp = await smAPIRequest(`/v1/datasets/${dsId}/delete`, {});

  logger.info(`Dataset '${dsId}' was deleted`);
  return resp;
};
