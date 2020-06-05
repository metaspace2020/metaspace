import {EntityManager} from 'typeorm';
import {MolecularDB as MolecularDbModel} from '../../moldb/model';
import {UserError} from 'graphql-errors';
import logger from '../../../utils/logger';

export const mapDatabaseToDatabaseId =
  async (entityManager: EntityManager, database: string): Promise<number> => {
    logger.warn('Addressing private databases by name was deprecated. Use database id instead.');
    const databaseModel = await entityManager.findOneOrFail(MolecularDbModel, { 'name': database });
    if (!databaseModel.public) {
      throw new UserError(
        'Addressing a non-public molecular database by name. Use database id instead.'
      );
    }
    return databaseModel.id;
  };
