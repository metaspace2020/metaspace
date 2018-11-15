import {Connection, EntityManager} from 'typeorm';
import {ContextUser} from '../../../context';
import {logger} from '../../../../utils';
import {getDatasetForEditing} from './getDatasetForEditing';
import {Dataset as DatasetModel, DatasetProject as DatasetProjectModel} from '../model';
import {DeleteDatasetArgs, smAPIDeleteDataset} from '../../../utils/smAPI';

export const deleteDataset = async (connection: Connection | EntityManager, user: ContextUser, dsId: string,
                                    args?: DeleteDatasetArgs) => {
  logger.info(`User '${user.id}' deleting '${dsId}' dataset...`);
  if (user.role !== 'admin') {
    // Skip this for admins so that datasets that are missing their graphql.dataset record can still be deleted
    await getDatasetForEditing(connection, user, dsId);
  }

  await connection.getRepository(DatasetProjectModel).delete({ datasetId: dsId });
  await connection.getRepository(DatasetModel).delete(dsId);
  const resp = await smAPIDeleteDataset(dsId, args);

  logger.info(`Dataset '${dsId}' was deleted`);
  return resp;
};
