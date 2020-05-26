import {EntityManager} from 'typeorm';
import {MolecularDB as MolecularDbModel} from '../../moldb/model';
import {UserError} from 'graphql-errors';
import logger from '../../../utils/logger';

export const mapDatabaseToDatabaseId =
  async (entityManager: EntityManager, database: string): Promise<number> => {
    logger.warn('Addressing private databases by name was deprecated. Use database ids instead.');
    const databaseModel = await entityManager.findOneOrFail(MolecularDbModel, { 'name': database });
    if (!databaseModel.public) {
      throw new UserError(
        'Using "database" field to access a non-public MolecularDB by name. Use "databaseId" field instead.'
      );
    }
    return databaseModel.id;
  };
