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

  private static getUserGroupIds(user: ContextUser | null) {
    if (user != null && user.groupIds != null && user.groupIds.length > 0) {
      return user.groupIds;
    }
    return null;
  }

  private queryWhere(user: ContextUser | null, andWhereClause?: string | Brackets, parameters?: object) {
    let qb = this.manager.createQueryBuilder(MolecularDB, 'moldb')
      .leftJoinAndSelect('moldb.group', 'moldb_group')
      .orderBy('moldb.name');

    // Hide databases the user doesn't have access to
    if (user && user.id && user.role === 'admin') {
      qb = qb.where('true'); // For consistency, in case `andWhere` is called without first calling `where`
    } else {
      const userGroupIds = MolecularDbRepository.getUserGroupIds(user);
      qb = qb.where(new Brackets(
        qb => qb.where('moldb.is_public = True').orWhere(
            userGroupIds != null ? 'moldb.group_id = ANY(:userGroupIds)' : 'false',
            { userGroupIds }
          )
        )
      );
    }

    // Add caller-supplied filter
    if (andWhereClause) {
      qb = qb.andWhere(andWhereClause, parameters);
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

  async findVisibleDatabases(user: ContextUser | null, groupId?: string): Promise<MolecularDB[]> {
    const query = (groupId != null)
      ? this.queryWhere(user, 'moldb.group_id = :groupId', { groupId })
      : this.queryWhere(user);
    return await query.getMany();
  }

  async findUsableDatabases(user: ContextUser | null): Promise<MolecularDB[]> {
    const userGroupIds = MolecularDbRepository.getUserGroupIds(user);
    const groupWhereStmt = userGroupIds != null
      ? new Brackets(qb => qb.where('moldb.group_id is NULL')
          .orWhere('moldb.group_id = ANY(:userGroupIds)'))
      : new Brackets(qb => qb.where('moldb.group_id is NULL'));
    const query = this.queryWhere(user,
      new Brackets(qb => qb.where('moldb.archived = false').andWhere(groupWhereStmt)),
      { userGroupIds });
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
