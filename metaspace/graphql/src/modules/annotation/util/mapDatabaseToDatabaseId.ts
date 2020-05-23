import {EntityManager} from 'typeorm';
import {AnnotationFilter} from '../../../binding';
import {MolecularDB as MolecularDbModel} from '../../moldb/model';
import {UserError} from 'graphql-errors';
import logger from '../../../utils/logger';

export const mapDatabaseToDatabaseId =
  async (entityManager: EntityManager, filter: AnnotationFilter | undefined): Promise<void> => {
    if (filter && !filter.databaseId && filter.database) {
      logger.warn(`Deprecated field "database" of AnnotationFilter was provided. Use "databaseId" instead.`);
      const database = await entityManager.findOneOrFail(
        MolecularDbModel, {'name': filter.database}
      );
      if (!database.public) {
        throw new UserError(
          'Using "database" field to access a non-public MolecularDB by name. Use "databaseId" field instead.'
        );
      }
      filter['databaseId'] = database.id;
    }
  };
