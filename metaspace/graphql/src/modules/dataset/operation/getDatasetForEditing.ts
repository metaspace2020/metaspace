import {EntityManager} from 'typeorm';
import {ContextUser} from '../../../context';
import {UserError} from 'graphql-errors';
import {Dataset as DatasetModel} from '../model';

export const getDatasetForEditing = async (entityManager: EntityManager, user: ContextUser | null, dsId: string) => {
  if (!user)
    throw new UserError('Access denied');

  if (!dsId)
    throw new UserError(`DS id not provided`);

  const ds = await entityManager.getRepository(DatasetModel).findOne({
    id: dsId,
  });
  if (!ds)
    throw new UserError(`DS ${dsId} does not exist`);

  if (user.id !== ds.userId && user.role !== 'admin')
    throw new UserError('Access denied');

  return ds;
};
