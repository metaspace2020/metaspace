import {Brackets, EntityManager, EntityRepository, In} from 'typeorm';
import {UserError} from 'graphql-errors';
import * as DataLoader from 'dataloader';
import * as _ from 'lodash';

import {MolecularDB} from './model';
import {Context, ContextUser} from '../../context';


@EntityRepository()
export class MolecularDbRepository {
  constructor(private manager: EntityManager) {
  }

  private queryWhere(user: ContextUser | null, whereClause?: string | Brackets, parameters?: object) {
    let qb = this.manager.createQueryBuilder(MolecularDB, 'moldb').orderBy('moldb.name');

    // Hide databases the user doesn't have access to
    if (user && user.id && user.role === 'admin') {
      qb = qb.where('true'); // For consistency, in case `andWhere` is called without first calling `where`
    } else {
      const userGroupIds = user && user.groupIds;
      qb = qb.where(new Brackets(
        qb => qb.where('moldb.public = True')
          .orWhere(
            userGroupIds ? 'moldb.group_id = ANY(:userGroupIds)' : 'false',
            { userGroupIds }
          )
        )
      );
    }

    // Add caller-supplied filter
    if (whereClause) {
      qb = qb.andWhere(whereClause, parameters);
    }

    // Avoid adding .where clauses to the returned queryBuilder, as it will overwrite the security filters
    return qb;
  }

  private getDataLoader(ctx: Context) {
    return ctx.contextCacheGet('MolecularDbRepository.getDataLoader', [], () => {
      return new DataLoader(async (databaseIds: number[]): Promise<any[]> => {
        const query = this.queryWhere(ctx.user, 'moldb.id = ANY(:databaseIds)', { databaseIds });
        const results = await query.getMany();
        const keyedResults = _.keyBy(results, 'id');
        return databaseIds.map(id => keyedResults[id]);
      });
    });
  }

  async findDatabases(user: ContextUser | null): Promise<MolecularDB[]> {
    const query = this.queryWhere(user);
    return await query.getMany();
  }

  async findDatabaseById(ctx: Context, databaseId: number): Promise<MolecularDB> {
    const dataLoader = this.getDataLoader(ctx);
    const database =  await dataLoader.load(databaseId);
    if (database == null) {
      throw new UserError(`Unauthorized or database does not exist`);
    }
    return database;
  }

  async findDatabasesByIds(ctx: Context, databaseIds: number[]): Promise<MolecularDB[]> {
    const dataLoader = this.getDataLoader(ctx);
    const databases = await dataLoader.loadMany(databaseIds);
    return databases.filter(db => db != null);
  }
}
